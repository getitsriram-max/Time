(function() {
  "use strict";

  const storageKey = "timeApp.entries.v1";

  /** @typedef {{ id: string, date: string, project: string, task: string, start: string, end: string, breakMin: number, durationHours: number, notes?: string }} TimeEntry */

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const form = $("#entry-form");
  const dateEl = $("#date");
  const projectEl = $("#project");
  const taskEl = $("#task");
  const startEl = $("#start");
  const endEl = $("#end");
  const breakEl = $("#break");
  const durationEl = $("#duration");
  const notesEl = $("#notes");
  const editIdEl = $("#edit-id");

  const tableBody = $("#entries-table tbody");
  const totalHoursEl = $("#total-hours");

  const filterFromEl = $("#filter-from");
  const filterToEl = $("#filter-to");
  const filterProjectEl = $("#filter-project");

  const applyFiltersBtn = $("#apply-filters");
  const clearFiltersBtn = $("#clear-filters");
  const exportCsvBtn = $("#export-csv");
  const clearAllBtn = $("#clear-all");
  const resetBtn = $("#reset-btn");

  // Weekly timesheet elements
  const weekPickerEl = $("#week-picker");
  const weekPrevBtn = $("#week-prev");
  const weekNextBtn = $("#week-next");
  const weekProjectEl = $("#week-project");
  const weekTaskEl = $("#week-task");
  const weekNotesEl = $("#week-notes");
  const weekTbody = $("#week-tbody");
  const weekSaveBtn = $("#week-save");
  const weekFill8hBtn = $("#week-fill-8h");
  const weekClearBtn = $("#week-clear");

  // File save controls
  const fileSaveEnabledEl = document.querySelector("#file-save-enabled");
  const chooseFileBtn = document.querySelector("#choose-file");
  const fileSaveStatusEl = document.querySelector("#file-save-status");

  /** @type {FileSystemFileHandle|null} */
  let fileHandle = null;

  let entries = loadEntries();

  function loadEntries() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch (err) {
      console.error("Failed to load entries", err);
      return [];
    }
  }

  function saveEntries() {
    localStorage.setItem(storageKey, JSON.stringify(entries));
  }

  function supportsFileSystemAccess() {
    return typeof window !== "undefined" && "showSaveFilePicker" in window;
  }

  function setFileStatus(message, isError = false) {
    if (!fileSaveStatusEl) return;
    fileSaveStatusEl.textContent = message || "";
    fileSaveStatusEl.style.color = isError ? "var(--danger)" : "var(--muted)";
  }

  async function verifyPermission(handle, withWrite) {
    if (!handle) return false;
    const opts = withWrite ? { mode: "readwrite" } : {};
    if (await handle.queryPermission(opts) === "granted") return true;
    if (await handle.requestPermission(opts) === "granted") return true;
    return false;
  }

  async function pickAndPrepareFile() {
    try {
      if (!supportsFileSystemAccess()) {
        setFileStatus("File saving unsupported; will download on save.");
        return null;
      }
      const fh = await window.showSaveFilePicker({
        suggestedName: "time-entries.json",
        types: [
          {
            description: "JSON Files",
            accept: { "application/json": [".json"] },
          },
        ],
      });
      const ok = await verifyPermission(fh, true);
      if (!ok) {
        setFileStatus("No permission to write to file.", true);
        return null;
      }
      fileHandle = fh;
      setFileStatus(`Ready: ${fh.name}`);
      await writeEntriesToFile();
      return fh;
    } catch (err) {
      // User might have cancelled; keep quiet unless it's a real error
      console.error("choose file failed", err);
      setFileStatus("File not selected.");
      return null;
    }
  }

  async function writeEntriesToFile() {
    if (!supportsFileSystemAccess() || !fileHandle) return;
    const text = JSON.stringify(entries, null, 2) + "\n";
    const writable = await fileHandle.createWritable();
    await writable.write(text);
    await writable.close();
  }

  function downloadEntriesJson() {
    const text = JSON.stringify(entries, null, 2) + "\n";
    const blob = new Blob([text], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `time-entries-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function maybeWriteFile() {
    try {
      if (!fileSaveEnabledEl || !fileSaveEnabledEl.checked) return;
      if (supportsFileSystemAccess() && fileHandle) {
        const ok = await verifyPermission(fileHandle, true);
        if (!ok) {
          setFileStatus("Permission lost; reselect file.", true);
          return;
        }
        await writeEntriesToFile();
        setFileStatus(`Saved ${entries.length} entr${entries.length === 1 ? "y" : "ies"} to ${fileHandle.name}`);
      } else if (supportsFileSystemAccess() && !fileHandle) {
        // Prompt user to pick a file
        await pickAndPrepareFile();
      } else {
        // Fallback: download a JSON snapshot
        downloadEntriesJson();
        setFileStatus("Downloaded JSON snapshot (no persistent access)");
      }
    } catch (err) {
      console.error("Failed to save to file", err);
      setFileStatus("Failed to save to file", true);
    }
  }

  function formatHours(h) {
    return `${h.toFixed(2)} h`;
  }

  function toMinutes(timeStr) {
    const [h, m] = timeStr.split(":").map((n) => parseInt(n, 10));
    return h * 60 + m;
  }

  function computeDurationHours(start, end, breakMin) {
    if (!start || !end) return 0;
    const startMin = toMinutes(start);
    const endMin = toMinutes(end);
    let diff = endMin - startMin - (breakMin || 0);
    if (diff < 0) diff += 24 * 60; // allow overnight
    return Math.max(0, diff) / 60;
  }

  function uid() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function resetForm() {
    form.reset();
    durationEl.value = "";
    editIdEl.value = "";
    $("#save-btn").textContent = "Save";
  }

  function validateForm() {
    const date = dateEl.value;
    const project = projectEl.value.trim();
    const task = taskEl.value.trim();
    const start = startEl.value;
    const end = endEl.value;
    const breakMin = Number(breakEl.value || 0);

    if (!date || !project || !task || !start || !end) {
      return { ok: false, message: "Please fill in all required fields." };
    }

    if (breakMin < 0 || Number.isNaN(breakMin)) {
      return { ok: false, message: "Break must be zero or positive." };
    }

    const duration = computeDurationHours(start, end, breakMin);
    if (duration <= 0) {
      return { ok: false, message: "Duration must be greater than zero." };
    }

    return { ok: true, data: { date, project, task, start, end, breakMin, duration } };
  }

  function onTimeFieldsChange() {
    const breakMin = Number(breakEl.value || 0);
    const duration = computeDurationHours(startEl.value, endEl.value, breakMin);
    durationEl.value = duration ? duration.toFixed(2) : "";
  }

  startEl.addEventListener("input", onTimeFieldsChange);
  endEl.addEventListener("input", onTimeFieldsChange);
  breakEl.addEventListener("input", onTimeFieldsChange);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const result = validateForm();
    if (!result.ok) {
      alert(result.message);
      return;
    }

    const { date, project, task, start, end, breakMin, duration } = result.data;

    const existingId = editIdEl.value;
    if (existingId) {
      const idx = entries.findIndex((x) => x.id === existingId);
      if (idx !== -1) {
        entries[idx] = { ...entries[idx], date, project, task, start, end, breakMin, durationHours: duration, notes: notesEl.value.trim() };
      }
    } else {
      const entry = /** @type {TimeEntry} */ ({
        id: uid(),
        date,
        project,
        task,
        start,
        end,
        breakMin,
        durationHours: duration,
        notes: notesEl.value.trim(),
      });
      entries.push(entry);
    }

    saveEntries();
    // Also save to file if enabled
    Promise.resolve().then(maybeWriteFile);
    render();
    resetForm();
  });

  resetBtn.addEventListener("click", (e) => {
    e.preventDefault();
    resetForm();
  });

  function render() {
    const { filtered, total } = getFilteredEntries();

    tableBody.innerHTML = "";
    for (const entry of filtered) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${entry.date}</td>
        <td>${escapeHtml(entry.project)}</td>
        <td>${escapeHtml(entry.task)}</td>
        <td>${entry.start}</td>
        <td>${entry.end}</td>
        <td><span class="badge">${entry.breakMin} min</span></td>
        <td>${formatHours(entry.durationHours)}</td>
        <td>${escapeHtml(entry.notes || "")}</td>
        <td>
          <div class="action-btns">
            <button data-action="edit" data-id="${entry.id}" class="secondary">Edit</button>
            <button data-action="delete" data-id="${entry.id}" class="danger">Delete</button>
          </div>
        </td>`;
      tableBody.appendChild(tr);
    }

    totalHoursEl.textContent = formatHours(total);
  }

  function getFilteredEntries() {
    const from = filterFromEl.value ? new Date(filterFromEl.value) : null;
    const to = filterToEl.value ? new Date(filterToEl.value) : null;
    const proj = filterProjectEl.value.trim().toLowerCase();

    const filtered = entries.filter((e) => {
      const d = new Date(e.date);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (proj && !e.project.toLowerCase().includes(proj)) return false;
      return true;
    }).sort((a, b) => a.date.localeCompare(b.date));

    const total = filtered.reduce((sum, e) => sum + (e.durationHours || 0), 0);
    return { filtered, total };
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"]+/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
  }

  tableBody.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const id = btn.getAttribute("data-id");
    const action = btn.getAttribute("data-action");
    if (!id || !action) return;

    if (action === "delete") {
      if (!confirm("Delete this entry?")) return;
      entries = entries.filter((x) => x.id !== id);
      saveEntries();
      Promise.resolve().then(maybeWriteFile);
      render();
      return;
    }

    if (action === "edit") {
      const entry = entries.find((x) => x.id === id);
      if (!entry) return;
      dateEl.value = entry.date;
      projectEl.value = entry.project;
      taskEl.value = entry.task;
      startEl.value = entry.start;
      endEl.value = entry.end;
      breakEl.value = String(entry.breakMin);
      durationEl.value = entry.durationHours.toFixed(2);
      notesEl.value = entry.notes || "";
      editIdEl.value = entry.id;
      $("#save-btn").textContent = "Update";
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });

  applyFiltersBtn.addEventListener("click", () => render());
  clearFiltersBtn.addEventListener("click", () => {
    filterFromEl.value = "";
    filterToEl.value = "";
    filterProjectEl.value = "";
    render();
  });

  clearAllBtn.addEventListener("click", () => {
    if (!entries.length) return;
    if (!confirm("This will remove all entries. Continue?")) return;
    entries = [];
    saveEntries();
    Promise.resolve().then(maybeWriteFile);
    render();
  });

  exportCsvBtn.addEventListener("click", () => {
    const { filtered } = getFilteredEntries();
    const header = ["Date","Project","Task","Start","End","Break (min)","Duration (h)","Notes"];
    const rows = [header].concat(filtered.map((e) => [e.date, e.project, e.task, e.start, e.end, String(e.breakMin), e.durationHours.toFixed(2), (e.notes || "").replace(/\n/g, " ")]));
    const csv = rows.map((cols) => cols.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `time-entries-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  function csvEscape(val) {
    const needsQuote = /[",\n]/.test(val);
    let out = val.replace(/"/g, '""');
    return needsQuote ? `"${out}"` : out;
  }

  // init defaults
  if (!dateEl.value) {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    dateEl.value = `${y}-${m}-${d}`;
  }

  render();

  // ========== Weekly timesheet ==========
  const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  function pad2(n) { return String(n).padStart(2, "0"); }

  function ymd(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function getMondayFromDate(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay() || 7; // Sun=0 -> 7
    d.setDate(d.getDate() - day + 1);
    return d;
  }

  function dateToIsoWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay() || 7; // Thu-based week numbering
    d.setDate(d.getDate() + 4 - day);
    const isoYear = d.getFullYear();
    const yearStart = new Date(isoYear, 0, 1);
    const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return { year: isoYear, week };
  }

  function getMondayOfIsoWeek(week, year) {
    const jan4 = new Date(year, 0, 4);
    const day = jan4.getDay() || 7;
    const mondayW1 = new Date(jan4);
    mondayW1.setDate(jan4.getDate() - day + 1);
    const monday = new Date(mondayW1);
    monday.setDate(mondayW1.getDate() + (week - 1) * 7);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }

  function setWeekPickerToDate(date) {
    if (!weekPickerEl) return;
    const { year, week } = dateToIsoWeek(date);
    weekPickerEl.value = `${year}-W${String(week).padStart(2, "0")}`;
  }

  function parseWeekPickerValue(value) {
    if (!value) return null;
    const m = /^(\d{4})-W(\d{2})$/.exec(value);
    if (!m) return null;
    const year = parseInt(m[1], 10);
    const week = parseInt(m[2], 10);
    return getMondayOfIsoWeek(week, year);
  }

  function renderWeekTable() {
    if (!weekTbody || !weekPickerEl) return;
    const monday = parseWeekPickerValue(weekPickerEl.value) || getMondayFromDate(new Date());
    const project = (weekProjectEl && weekProjectEl.value || "").trim();
    const task = (weekTaskEl && weekTaskEl.value || "").trim();

    weekTbody.innerHTML = "";
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(monday);
      dayDate.setDate(monday.getDate() + i);
      const dateStr = ymd(dayDate);
      let hoursValue = "";
      let dayNotes = "";
      if (project && task) {
        const existing = entries.find((e) => e.date === dateStr && e.project === project && e.task === task && !e.start && !e.end);
        if (existing) {
          hoursValue = (existing.durationHours || 0).toFixed(2);
          dayNotes = existing.notes || "";
        }
      }
      const tr = document.createElement("tr");
      tr.setAttribute("data-date", dateStr);
      tr.innerHTML = `
        <td>${DAY_LABELS[i]}</td>
        <td>${dateStr}</td>
        <td>
          <input type=\"number\" class=\"hours-input\" min=\"0\" step=\"0.25\" inputmode=\"decimal\" data-date=\"${dateStr}\" value=\"${hoursValue}\" placeholder=\"0\" />
        </td>
        <td>
          <input type=\"text\" class=\"note-input\" data-date=\"${dateStr}\" value=\"${escapeHtml(dayNotes)}\" placeholder=\"Optional\" />
        </td>`;
      weekTbody.appendChild(tr);
    }
  }

  if (weekPickerEl) {
    setWeekPickerToDate(new Date());
    renderWeekTable();

    weekPickerEl.addEventListener("input", renderWeekTable);
    weekPrevBtn && weekPrevBtn.addEventListener("click", () => {
      const monday = parseWeekPickerValue(weekPickerEl.value) || getMondayFromDate(new Date());
      const prev = new Date(monday);
      prev.setDate(monday.getDate() - 7);
      setWeekPickerToDate(prev);
      renderWeekTable();
    });
    weekNextBtn && weekNextBtn.addEventListener("click", () => {
      const monday = parseWeekPickerValue(weekPickerEl.value) || getMondayFromDate(new Date());
      const next = new Date(monday);
      next.setDate(monday.getDate() + 7);
      setWeekPickerToDate(next);
      renderWeekTable();
    });

    weekProjectEl && weekProjectEl.addEventListener("input", renderWeekTable);
    weekTaskEl && weekTaskEl.addEventListener("input", renderWeekTable);

    weekFill8hBtn && weekFill8hBtn.addEventListener("click", () => {
      if (!weekTbody) return;
      const rows = Array.from(weekTbody.querySelectorAll("tr"));
      rows.forEach((tr, idx) => {
        const hoursInput = tr.querySelector("input.hours-input");
        if (!hoursInput) return;
        hoursInput.value = idx < 5 ? "8" : "0"; // 8h Mon-Fri
      });
    });

    weekClearBtn && weekClearBtn.addEventListener("click", () => {
      if (!weekTbody) return;
      const hoursInputs = weekTbody.querySelectorAll("input.hours-input");
      const noteInputs = weekTbody.querySelectorAll("input.note-input");
      hoursInputs.forEach((el) => (el.value = ""));
      noteInputs.forEach((el) => (el.value = ""));
    });

    weekSaveBtn && weekSaveBtn.addEventListener("click", () => {
      const project = (weekProjectEl && weekProjectEl.value || "").trim();
      const task = (weekTaskEl && weekTaskEl.value || "").trim();
      const notesAll = (weekNotesEl && weekNotesEl.value || "").trim();
      if (!project || !task) {
        alert("Please provide Project and Task for the week.");
        return;
      }
      if (!weekTbody) return;

      const rows = Array.from(weekTbody.querySelectorAll("tr"));
      for (const tr of rows) {
        const dateStr = tr.getAttribute("data-date");
        const hoursInput = tr.querySelector("input.hours-input");
        const noteInput = tr.querySelector("input.note-input");
        if (!dateStr || !hoursInput || !noteInput) continue;
        const hours = Number(hoursInput.value || 0);
        const dayNotes = (noteInput.value || "").trim();
        const combinedNotes = [dayNotes, notesAll].filter(Boolean).join(" | ");

        if (Number.isNaN(hours) || hours < 0) continue;

        const existingIdx = entries.findIndex(
          (e) => e.date === dateStr && e.project === project && e.task === task && !e.start && !e.end
        );
        if (hours > 0) {
          if (existingIdx !== -1) {
            entries[existingIdx] = {
              ...entries[existingIdx],
              durationHours: hours,
              breakMin: 0,
              start: "",
              end: "",
              notes: combinedNotes,
            };
          } else {
            entries.push({
              id: uid(),
              date: dateStr,
              project,
              task,
              start: "",
              end: "",
              breakMin: 0,
              durationHours: hours,
              notes: combinedNotes,
            });
          }
        } else {
          // hours == 0 -> remove existing weekly-only entry if any
          if (existingIdx !== -1) {
            entries.splice(existingIdx, 1);
          }
        }
      }

      saveEntries();
      Promise.resolve().then(maybeWriteFile);
      render();
      renderWeekTable();
    });
  }

  // Wire up file save UI
  if (chooseFileBtn) {
    chooseFileBtn.addEventListener("click", () => {
      pickAndPrepareFile();
    });
  }

  if (fileSaveEnabledEl) {
    fileSaveEnabledEl.addEventListener("change", async (ev) => {
      if (fileSaveEnabledEl.checked) {
        if (supportsFileSystemAccess() && !fileHandle) {
          await pickAndPrepareFile();
        } else if (!supportsFileSystemAccess()) {
          setFileStatus("Will download JSON on save (no persistent access)");
        }
      } else {
        setFileStatus("");
      }
    });
  }

  // Initialize UI state
  if (chooseFileBtn && !supportsFileSystemAccess()) {
    chooseFileBtn.disabled = true;
    setFileStatus("File saving unsupported; will download JSON on save.");
  }
})();
