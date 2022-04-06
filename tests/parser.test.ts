import { assert, expect } from "chai";
import { parser } from "lezer-python";
import * as p from "../parser";
import { exprFromLiteral, intTypedVar, boolTypedVar } from "../ast";

describe("traverseFuncDef function", () => {
  it("parses a basic function", () => {
    const source = "def f(a: int) -> int: pass";
    const cursor = parser.parse(source).cursor();
    cursor.firstChild();
    const parsed = p.traverseFuncDef(source, cursor);
    expect(parsed).to.deep.equal({
      name: "f",
      params: [intTypedVar("a")],
      ret: { tag: "int" },
      var_def: [],
      body: [{ tag: "pass" }],
    });
  });

  it("parses a function without argument", () => {
    const source = "def f() -> int: pass";
    const cursor = parser.parse(source).cursor();
    cursor.firstChild();
    const parsed = p.traverseFuncDef(source, cursor);
    expect(parsed).to.deep.equal({
      name: "f",
      params: [],
      ret: { tag: "int" },
      var_def: [],
      body: [{ tag: "pass" }],
    });
  });

  it("parses a function with 2 arguments", () => {
    const source = "def f(x: int, y: bool) -> int: pass";
    const cursor = parser.parse(source).cursor();
    cursor.firstChild();
    const parsed = p.traverseFuncDef(source, cursor);
    expect(parsed).to.deep.equal({
      name: "f",
      params: [intTypedVar("x"), boolTypedVar("y")],
      ret: { tag: "int" },
      var_def: [],
      body: [{ tag: "pass" }],
    });
  });

  it("parses a function with var_def", () => {
    const source = `
def f(a: int) -> int:
  x: int = 0
  pass`;
    const cursor = parser.parse(source).cursor();
    cursor.firstChild();
    const parsed = p.traverseFuncDef(source, cursor);
    expect(parsed).to.deep.equal({
      name: "f",
      params: [{ name: "a", typ: { tag: "int" } }],
      ret: { tag: "int" },
      var_def: [{ var_: { name: "x", typ: { tag: "int" } }, value: exprFromLiteral(0) }],
      body: [{ tag: "pass" }],
    });
  });

  it("parses a function without return type", () => {
    const source = `
def f(a: int):
  x: int = 0
  pass`;
    const cursor = parser.parse(source).cursor();
    cursor.firstChild();
    const parsed = p.traverseFuncDef(source, cursor);
    expect(parsed).to.deep.equal({
      name: "f",
      params: [{ name: "a", typ: { tag: "int" } }],
      ret: { tag: "none" },
      var_def: [{ var_: { name: "x", typ: { tag: "int" } }, value: exprFromLiteral(0) }],
      body: [{ tag: "pass" }],
    });
  });
});

describe("parseProgram function", () => {
  it("parses a basic program", () => {
    const source = `
glob: int = 0
def f(a: bool):
  pass
f(False)`;
    const parsed = p.parseProgram(source);
    expect(parsed).to.deep.equal({
      decls: [
        {
          tag: "var_def",
          decl: { var_: intTypedVar("glob"), value: exprFromLiteral(0) },
        },
        {
          tag: "func_def",
          decl: {
            name: "f",
            params: [boolTypedVar("a")],
            ret: { tag: "none" },
            var_def: [],
            body: [{ tag: "pass" }],
          },
        },
      ],
      stmts: [
        {
          tag: "expr",
          expr: { tag: "call", name: "f", args: [exprFromLiteral(false)] },
        },
      ],
    });
  });
});
