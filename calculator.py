#!/usr/bin/env python3
"""
Simple command-line calculator.

Usage examples:
  python calculator.py "2 + 3 * 4"
  python calculator.py add 1 2 3.5
  python calculator.py sub 10 4 1
  python calculator.py mul 2 3 4
  python calculator.py div 20 5 2
  python calculator.py --interactive

The interactive mode accepts either arithmetic expressions (e.g., 2+2*5)
or commands like: add 1 2 3
"""
from __future__ import annotations

import argparse
import ast
import math
import operator
import sys
from typing import Callable, Iterable, Union

Number = Union[int, float]


def add(values: Iterable[Number]) -> float:
    total: float = 0.0
    for value in values:
        total += float(value)
    return total


def subtract(values: Iterable[Number]) -> float:
    iterator = iter(values)
    try:
        first: float = float(next(iterator))
    except StopIteration as exc:
        raise ValueError("subtract requires at least one operand") from exc
    result: float = first
    for value in iterator:
        result -= float(value)
    return result


def multiply(values: Iterable[Number]) -> float:
    product: float = 1.0
    has_value: bool = False
    for value in values:
        product *= float(value)
        has_value = True
    if not has_value:
        raise ValueError("multiply requires at least one operand")
    return product


def divide(values: Iterable[Number]) -> float:
    iterator = iter(values)
    try:
        first: float = float(next(iterator))
    except StopIteration as exc:
        raise ValueError("divide requires at least one operand") from exc
    result: float = first
    for value in iterator:
        divisor = float(value)
        if divisor == 0.0:
            raise ZeroDivisionError("division by zero")
        result /= divisor
    return result


_ALLOWED_BIN_OPS: dict[type[ast.operator], Callable[[float, float], float]] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}
_ALLOWED_UNARY_OPS: dict[type[ast.unaryop], Callable[[float], float]] = {
    ast.UAdd: lambda x: +x,
    ast.USub: lambda x: -x,
}


def evaluate_expression(expression: str) -> float:
    """Safely evaluate a basic arithmetic expression.

    Supports: +, -, *, /, %, **, parentheses, unary +/-, integers and floats.
    """
    try:
        parsed = ast.parse(expression, mode="eval")
    except SyntaxError as exc:
        raise ValueError(f"Invalid expression: {expression}") from exc

    def _eval(node: ast.AST) -> float:
        if isinstance(node, ast.Expression):
            return _eval(node.body)
        if isinstance(node, ast.Constant):
            if isinstance(node.value, (int, float)):
                return float(node.value)
            raise ValueError("Only numeric constants are allowed")
        if hasattr(ast, "Num") and isinstance(node, getattr(ast, "Num")):
            return float(getattr(node, "n"))
        if isinstance(node, ast.BinOp):
            op_type = type(node.op)
            if op_type not in _ALLOWED_BIN_OPS:
                raise ValueError(f"Operator not allowed: {op_type.__name__}")
            left_val = _eval(node.left)
            right_val = _eval(node.right)
            if op_type is ast.Div and right_val == 0.0:
                raise ZeroDivisionError("division by zero")
            return float(_ALLOWED_BIN_OPS[op_type](left_val, right_val))
        if isinstance(node, ast.UnaryOp):
            op_type = type(node.op)
            if op_type not in _ALLOWED_UNARY_OPS:
                raise ValueError(f"Unary operator not allowed: {op_type.__name__}")
            operand_val = _eval(node.operand)
            return float(_ALLOWED_UNARY_OPS[op_type](operand_val))
        if isinstance(node, ast.Call):
            raise ValueError("Function calls are not allowed in expressions")
        if isinstance(node, (ast.Name, ast.Attribute, ast.Subscript, ast.List, ast.Dict, ast.Tuple)):
            raise ValueError("Only numeric arithmetic is supported")
        raise ValueError(f"Unsupported expression element: {type(node).__name__}")

    return _eval(parsed)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Simple CLI calculator")
    parser.add_argument("--interactive", "-i", action="store_true", help="Start interactive REPL")
    return parser


def run_command(command: str, operands: list[float]) -> float:
    if command == "add":
        return add(operands)
    if command == "sub":
        return subtract(operands)
    if command == "mul":
        return multiply(operands)
    if command == "div":
        return divide(operands)
    raise ValueError("Unknown command. Use add, sub, mul, or div.")


def format_number(value: float) -> str:
    if math.isfinite(value) and float(value).is_integer():
        return str(int(value))
    return str(value)


def repl() -> None:
    print('Calculator REPL. Enter expressions or commands like "add 1 2".')
    print('Type "exit" or press Ctrl-D to quit.')
    while True:
        try:
            line = input("> ").strip()
        except EOFError:
            print()
            break
        if not line:
            continue
        if line.lower() in {"exit", "quit"}:
            break
        # Try as expression first
        try:
            result = evaluate_expression(line)
            print(format_number(result))
            continue
        except Exception:
            pass
        # Try as command form
        parts = line.split()
        cmd, *rest = parts
        try:
            numbers = [float(x) for x in rest]
        except ValueError:
            print("Invalid input. Enter an arithmetic expression or 'add|sub|mul|div' followed by numbers.")
            continue
        try:
            if cmd == "add":
                print(format_number(add(numbers)))
            elif cmd == "sub":
                print(format_number(subtract(numbers)))
            elif cmd == "mul":
                print(format_number(multiply(numbers)))
            elif cmd == "div":
                print(format_number(divide(numbers)))
            else:
                print("Unknown command. Use add, sub, mul, div or enter an expression.")
        except Exception as exc:
            print(f"Error: {exc}")


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args, tokens = parser.parse_known_args(argv)

    # Start REPL if requested or if no other input provided
    if args.interactive or len(tokens) == 0:
        repl()
        return 0

    try:
        # Subcommand form: add|sub|mul|div <numbers...>
        if tokens[0] in {"add", "sub", "mul", "div"}:
            cmd = tokens[0]
            try:
                numbers = [float(x) for x in tokens[1:]]
            except ValueError as exc:
                raise ValueError("All operands must be numbers") from exc
            result = run_command(cmd, numbers)
        else:
            # Expression form: everything is part of the expression
            expression = " ".join(tokens)
            result = evaluate_expression(expression)

        print(format_number(result))
        return 0
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
