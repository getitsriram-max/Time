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
})();
