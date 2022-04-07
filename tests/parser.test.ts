import { expect } from "chai";
import { parser } from "lezer-python";
import * as p from "../parser";
import { exprFromLiteral, intTypedVar, boolTypedVar, Expr, Stmt, namedVar } from "../ast";

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

describe("traverseExpr function", () => {
  const verify = (source: string, value: Expr) => {
    const cursor = parser.parse(source).cursor();
    cursor.firstChild();
    cursor.firstChild();
    const parsed = p.traverseExpr(source, cursor);
    expect(parsed).to.deep.equal(value);
  };

  it("parses literals", () => {
    const verifylit = (source: string, value: any) => {
      verify(source, exprFromLiteral(value));
    };
    verifylit("1", 1);
    verifylit("100", 100);
    verifylit("False", false);
    verifylit("True", true);
    verifylit("None", null);
  });

  it("parses a paren expr", () => {
    verify("(1+2)+3", {
      tag: "binop",
      op: "+",
      left: {
        tag: "binop",
        op: "+",
        left: exprFromLiteral(1),
        right: exprFromLiteral(2),
      },
      right: exprFromLiteral(3),
    });
  });

  it("parses expr with ops", () => {
    verify("-1", { tag: "uniop", op: "-", value: exprFromLiteral(1) });
    verify("not True", { tag: "uniop", op: "not", value: exprFromLiteral(true) });
    verify("True is None", {
      tag: "binop",
      op: "is",
      left: exprFromLiteral(true),
      right: exprFromLiteral(null),
    });
    verify("3 <= 4", {
      tag: "binop",
      op: "<=",
      left: exprFromLiteral(3),
      right: exprFromLiteral(4),
    });

    verify("not (True is None)", {
      tag: "uniop",
      op: "not",
      value: { tag: "binop", op: "is", left: exprFromLiteral(true), right: exprFromLiteral(null) },
    });
    verify("3 + 1 - 4 * 1 // 5", {
      tag: "binop",
      op: "-",
      left: { tag: "binop", op: "+", left: exprFromLiteral(3), right: exprFromLiteral(1) },
      right: {
        tag: "binop",
        op: "//",
        left: { tag: "binop", op: "*", left: exprFromLiteral(4), right: exprFromLiteral(1) },
        right: exprFromLiteral(5),
      },
    });
    verify("1 <= 2 <= 3", {
      tag: "binop",
      op: "<=",
      left: {
        tag: "binop",
        op: "<=",
        left: exprFromLiteral(1),
        right: exprFromLiteral(2),
      },
      right: exprFromLiteral(3),
    });
  });

  it("parses expr with function calls", () => {
    verify("g()", { tag: "call", name: "g", args: [] });
    verify("f(1)", { tag: "call", name: "f", args: [exprFromLiteral(1)] });
    verify("3 + f(None)", {
      tag: "binop",
      op: "+",
      left: exprFromLiteral(3),
      right: { tag: "call", name: "f", args: [exprFromLiteral(null)] },
    });
    verify("f(g(h(1), 2))", {
      tag: "call",
      name: "f",
      args: [
        {
          tag: "call",
          name: "g",
          args: [
            {
              tag: "call",
              name: "h",
              args: [exprFromLiteral(1)],
            },
            exprFromLiteral(2),
          ],
        },
      ],
    });
  });
});

describe("traverseStmt function", () => {
  const verify = (source: string, value: Stmt) => {
    const cursor = parser.parse(source).cursor();
    cursor.firstChild();
    const parsed = p.traverseStmt(source, cursor);
    expect(parsed).to.deep.equal(value);
  };

  it("parses basic statements", () => {
    verify("pass", { tag: "pass" });
    verify("a = 1", { tag: "assign", name: "a", value: exprFromLiteral(1) });
    verify("return", {
      tag: "return",
      value: exprFromLiteral(null),
    });
    verify("return a + b", {
      tag: "return",
      value: { tag: "binop", op: "+", left: namedVar("a"), right: namedVar("b") },
    });
    verify("print(1)", {
      tag: "expr",
      expr: { tag: "call", name: "print", args: [exprFromLiteral(1)] },
    });
  });

  it("parses if statements", () => {
    verify("if True: pass", {
      tag: "if",
      branches: [{ cond: exprFromLiteral(true), body: [{ tag: "pass" }] }],
      else_: [],
    });
    verify("if True: pass\nelse: pass", {
      tag: "if",
      branches: [{ cond: exprFromLiteral(true), body: [{ tag: "pass" }] }],
      else_: [{ tag: "pass" }],
    });
    verify("if True: pass\nelif a: pass\nelif b: pass", {
      tag: "if",
      branches: [
        { cond: exprFromLiteral(true), body: [{ tag: "pass" }] },
        { cond: namedVar("a"), body: [{ tag: "pass" }] },
        { cond: namedVar("b"), body: [{ tag: "pass" }] },
      ],
      else_: [],
    });
    verify("if True: pass\nelif a: pass\nelif b: pass\nelse: pass", {
      tag: "if",
      branches: [
        { cond: exprFromLiteral(true), body: [{ tag: "pass" }] },
        { cond: namedVar("a"), body: [{ tag: "pass" }] },
        { cond: namedVar("b"), body: [{ tag: "pass" }] },
      ],
      else_: [{ tag: "pass" }],
    });
  });
});
