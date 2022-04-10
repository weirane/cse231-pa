import { assert, expect } from "chai";
import * as t from "../tc";
import { parseProgram } from "../parser";

describe("typecheck expressions", () => {
  const verifyThrows = (scope: string, code: string, message: any) => {
    const s = parseProgram(code).stmts[0];
    if (s.tag !== "expr") {
      assert.fail("first stmt should be expr");
    }
    const sc = t.scopeFromDecls(parseProgram(scope).decls);
    expect(() => t.tcExpr(s.expr, sc)).to.throw(message);
  };

  it("checks uniops", () => {
    const scope = `i: int = 0\nb: bool = False`;
    verifyThrows(scope, "-b", "Expected int");
    verifyThrows(scope, "not i", "Expected bool");
  });

  it("checks binops", () => {
    const scope = `i1: int = 0\ni2: int = 0\nb1: bool = False\nb2: bool = True`;
    verifyThrows(scope, "b1 + b2", "Cannot `add`");
    verifyThrows(scope, "b1 - b2", "Cannot `sub`");
    verifyThrows(scope, "i1 // b2", "Cannot `floordiv`");
    verifyThrows(scope, "b1 > i1", "Cannot compare bool with int");
    verifyThrows(scope, "i1 is i1", "Cannot `is` int with int");
  });
});

describe("typecheck statements", () => {
  const verifyThrows = (code: string, message: any) => {
    const p = parseProgram(code);
    expect(() => t.tcProgram(p)).to.throw(message);
  };
  const verifySucc = (code: string) => {
    const p = parseProgram(code);
    t.tcProgram(p);
  };

  it("checks init/assigns", () => {
    verifyThrows(`f: bool = 0`, "Cannot assign");
    verifyThrows(`f: bool = False\nf = 0`, "Cannot assign");
    verifyThrows(
      `
def f(a: int):
  a = False`,
      "Cannot assign"
    );
    verifyThrows(
      `
def f(a: int):
  b: bool = True
  b = 0`,
      "Cannot assign"
    );
  });

  it("checks if and while", () => {
    verifyThrows(
      `
b: int = 0
if b:
  b = False`,
      "Condition expression cannot be of type int"
    );
    verifyThrows(
      `
def f():
  pass
if f():
  pass`,
      "Condition expression cannot be of type none"
    );
  });

  it("checks the return type", () => {
    verifyThrows(
      `
def a():
  return 1`,
      "int returned but none expected"
    );
    verifyThrows(
      `
def a() -> int:
  pass`,
      "Function must return a value"
    );
    verifyThrows(
      `
def a() -> int:
  x: int = 0
  if x == 0:
    return 1
  else:
    pass`,
      "Function must return a value"
    );
    verifyThrows(
      `
def a() -> int:
  x: int = 0
  if x == 0:
    return 1
  else:
    return False`,
      "bool returned but int expected"
    );
    verifySucc(
      `
def a() -> int:
  x: int = 0
  return x`
    );
    verifySucc(
      `
def a() -> int:
  x: int = 0
  if x == 0:
    return 1
  else:
    return 2`
    );
    verifySucc(
      `
def a() -> int:
  x: int = 0
  if x == 0:
    return 1
  elif x == 1:
    return 2
  else:
    return 3`
    );
  });
});

describe("typecheck programs", () => {
  const verifyThrows = (code: string, message: any) => {
    const p = parseProgram(code);
    expect(() => t.tcProgram(p)).to.throw(message);
  };

  it("doesn't allow duplicate declarations", () => {
    verifyThrows(
      `
f: bool = False
f: int = 0`,
      "Duplicate declaration"
    );
    verifyThrows(
      `
def f():
  pass
f: int = 0`,
      "Duplicate declaration"
    );
    verifyThrows(
      `
f: int = 0
def f():
  pass`,
      "Duplicate declaration"
    );
    verifyThrows(
      `
def f():
  pass
def f():
  pass`,
      "Duplicate declaration"
    );

    verifyThrows(
      `
def f(a: int, a: int):
  pass`,
      "Duplicate declaration"
    );
    verifyThrows(
      `
def f(a: int, b: int):
  a: int = 0
  pass`,
      "Duplicate declaration"
    );
    verifyThrows(
      `
def f(a: int):
  b: int = 0
  b: int = 0
  pass`,
      "Duplicate declaration"
    );
  });
});
