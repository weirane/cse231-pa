import { expect } from "chai";
import { parser } from "lezer-python";
import * as p from "../parser";
import { exprFromLiteral, intTypedVar, boolTypedVar, classVar, Expr, Stmt, namedVar } from "../ast";

describe("traverseFuncDef function", () => {
  it("parses a basic function", () => {
    const source = "def f(self: X, a: int) -> int: pass";
    const cursor = parser.parse(source).cursor();
    cursor.firstChild();
    const parsed = p.traverseFuncDef(source, cursor);
    expect(parsed).to.deep.equal({
      name: "f",
      params: [classVar("X", "self"), intTypedVar("a")],
      ret: { tag: "int" },
      var_def: [],
      body: [{ tag: "pass" }],
    });
  });

  it("parses a function without argument", () => {
    const source = "def f(self: X) -> int: pass";
    const cursor = parser.parse(source).cursor();
    cursor.firstChild();
    const parsed = p.traverseFuncDef(source, cursor);
    expect(parsed).to.deep.equal({
      name: "f",
      params: [classVar("X", "self")],
      ret: { tag: "int" },
      var_def: [],
      body: [{ tag: "pass" }],
    });
  });

  it("parses a function with 2 arguments", () => {
    const source = "def f(self: X, x: int, y: bool) -> int: pass";
    const cursor = parser.parse(source).cursor();
    cursor.firstChild();
    const parsed = p.traverseFuncDef(source, cursor);
    expect(parsed).to.deep.equal({
      name: "f",
      params: [classVar("X", "self"), intTypedVar("x"), boolTypedVar("y")],
      ret: { tag: "int" },
      var_def: [],
      body: [{ tag: "pass" }],
    });
  });

  it("parses a function with var_def", () => {
    const source = `
def f(self: X, a: int) -> int:
  x: int = 0
  pass`;
    const cursor = parser.parse(source).cursor();
    cursor.firstChild();
    const parsed = p.traverseFuncDef(source, cursor);
    expect(parsed).to.deep.equal({
      name: "f",
      params: [classVar("X", "self"), intTypedVar("a")],
      ret: { tag: "int" },
      var_def: [{ var_: { name: "x", typ: { tag: "int" } }, value: exprFromLiteral(0) }],
      body: [{ tag: "pass" }],
    });
  });

  it("parses a function without return type", () => {
    const source = `
def f(self: X, a: int):
  x: int = 0
  pass`;
    const cursor = parser.parse(source).cursor();
    cursor.firstChild();
    const parsed = p.traverseFuncDef(source, cursor);
    expect(parsed).to.deep.equal({
      name: "f",
      params: [classVar("X", "self"), intTypedVar("a")],
      ret: { tag: "none" },
      var_def: [{ var_: { name: "x", typ: { tag: "int" } }, value: exprFromLiteral(0) }],
      body: [{ tag: "pass" }],
    });
  });
});

describe("parseProgram function", () => {
  const itVerifyThrows = (msg: string, source: string, value: any) => {
    it(msg, () => {
      expect(() => p.parseProgram(source)).to.throw(value);
    });
  };

  it("parses a basic program", () => {
    const source = `
glob: int = 0
class Foo(object):
  x: int = 0
  def f(self: Foo, a: bool):
    pass
f: Foo = None
f = Foo()
f.f(False)`;
    const parsed = p.parseProgram(source);
    expect(parsed).to.deep.equal({
      decls: [
        {
          tag: "var_def",
          decl: { var_: intTypedVar("glob"), value: exprFromLiteral(0) },
        },
        {
          tag: "class_def",
          decl: {
            name: "Foo",
            fields: [{ var_: intTypedVar("x"), value: exprFromLiteral(0) }],
            methods: [
              {
                name: "f",
                params: [classVar("Foo", "self"), boolTypedVar("a")],
                ret: { tag: "none" },
                var_def: [],
                body: [{ tag: "pass" }],
              },
            ],
          },
        },
        {
          tag: "var_def",
          decl: { var_: classVar("Foo", "f"), value: exprFromLiteral(null) },
        },
      ],
      stmts: [
        {
          tag: "assign",
          lvalue: { tag: "var", name: "f" },
          value: { tag: "call", name: "Foo", args: [], receiver: null },
        },
        {
          tag: "expr",
          expr: {
            tag: "call",
            name: "f",
            args: [exprFromLiteral(false)],
            receiver: { tag: "id", name: "f" },
          },
        },
      ],
    });
  });

  it("parses a program whose first stmt is assign", () => {
    const source = "f: bool = False\nf = 0";
    const parsed = p.parseProgram(source);
    expect(parsed).to.deep.equal({
      decls: [{ tag: "var_def", decl: { var_: boolTypedVar("f"), value: exprFromLiteral(false) } }],
      stmts: [{ tag: "assign", lvalue: { tag: "var", name: "f" }, value: exprFromLiteral(0) }],
    });
  });

  it("parses an empty program", () => {
    const source = "";
    const parsed = p.parseProgram(source);
    expect(parsed).to.deep.equal({
      decls: [],
      stmts: [],
    });
  });

  it("parses a program without declarations", () => {
    const source = `
print(3)
print(4)`;
    const parsed = p.parseProgram(source);
    expect(parsed).to.deep.equal({
      decls: [],
      stmts: [
        {
          tag: "expr",
          expr: { tag: "call", name: "print", args: [exprFromLiteral(3)], receiver: null },
        },
        {
          tag: "expr",
          expr: { tag: "call", name: "print", args: [exprFromLiteral(4)], receiver: null },
        },
      ],
    });
  });

  it("parses a program without statements", () => {
    const source = `
glob: int = 0
class Foo(object):
  def f(self: Foo):
    pass`;
    const parsed = p.parseProgram(source);
    expect(parsed).to.deep.equal({
      decls: [
        {
          tag: "var_def",
          decl: { var_: intTypedVar("glob"), value: exprFromLiteral(0) },
        },
        {
          tag: "class_def",
          decl: {
            name: "Foo",
            fields: [],
            methods: [
              {
                name: "f",
                params: [classVar("Foo", "self")],
                ret: { tag: "none" },
                var_def: [],
                body: [{ tag: "pass" }],
              },
            ],
          },
        },
      ],
      stmts: [],
    });
  });

  it("doesn't allow init with expr", () => {
    const prog = "x: int = 2 + 3";
    expect(() => p.parseProgram(prog)).to.throw("initialize with literal");
    const prog2 = "x: int = 5\nx = 2 + 3";
    p.parseProgram(prog2);
  });

  itVerifyThrows(
    "ensures method has an argument",
    `
class Foo(object):
  def f():
    pass`,
    "First parameter must be self"
  );

  itVerifyThrows(
    "ensures first method argument is self",
    `
class Foo(object):
  def f(sef: Foo):
    pass`,
    "First parameter must be self"
  );
});

describe("traverseExpr function", () => {
  const verify = (source: string, value: Expr) => {
    const cursor = parser.parse(source).cursor();
    cursor.firstChild();
    cursor.firstChild();
    const parsed = p.traverseExpr(source, cursor);
    expect(parsed).to.deep.equal(value);
  };

  const verifyThrows = (source: string, value: any) => {
    const cursor = parser.parse(source).cursor();
    cursor.firstChild();
    cursor.firstChild();
    expect(() => p.traverseExpr(source, cursor)).to.throw(value);
  };

  const itVerifies = (msg: string, source: string, value: Expr) => {
    it(msg, () => verify(source, value));
  };

  const itVerifyThrows = (msg: string, source: string, value: any) => {
    it(msg, () => verifyThrows(source, value));
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

  it("parses an unmatched paren", () => {
    const source = "(2+3";
    const cursor = parser.parse(source).cursor();
    cursor.firstChild();
    cursor.firstChild();
    expect(() => p.traverseExpr(source, cursor)).to.throw("unmatched parenthesis");
  });

  it("parses an unmatched paren in call expr", () => {
    const source = "print(2";
    const cursor = parser.parse(source).cursor();
    cursor.firstChild();
    cursor.firstChild();
    expect(() => p.traverseExpr(source, cursor)).to.throw("unmatched parenthesis");
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
    verify("Foo()", { tag: "call", name: "Foo", args: [], receiver: null });
    verify("o.f(1)", {
      tag: "call",
      name: "f",
      args: [exprFromLiteral(1)],
      receiver: { tag: "id", name: "o" },
    });
    verify("3 + o.f(None)", {
      tag: "binop",
      op: "+",
      left: exprFromLiteral(3),
      right: {
        tag: "call",
        name: "f",
        args: [exprFromLiteral(null)],
        receiver: { tag: "id", name: "o" },
      },
    });
  });

  it("checks the argument number of print", () => {
    verifyThrows("print()", "print takes exactly one argument");
    verify("print(v)", {
      tag: "call",
      name: "print",
      args: [{ tag: "id", name: "v" }],
      receiver: null,
    });
    verifyThrows("print(1, 2)", "print takes exactly one argument");
  });

  itVerifies("parses an expr as receiver", "(o + f).g()", {
    tag: "call",
    name: "g",
    args: [],
    receiver: {
      tag: "binop",
      op: "+",
      left: { tag: "id", name: "o" },
      right: { tag: "id", name: "f" },
    },
  });

  itVerifyThrows(
    "checks the number of arguments of constructors",
    "Foo(1, 2)",
    "constructors take no arguments"
  );

  itVerifies("parses a field access", "o.f", {
    tag: "field",
    expr: { tag: "id", name: "o" },
    name: "f",
  });

  itVerifies("parses a field access on complex expr", "(o + 1).f", {
    tag: "field",
    expr: {
      tag: "binop",
      op: "+",
      left: { tag: "id", name: "o" },
      right: exprFromLiteral(1),
    },
    name: "f",
  });

  itVerifies("parses self in exprs", "self.f", {
    tag: "field",
    expr: { tag: "id", name: "self" },
    name: "f",
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
    verify("a = 1", {
      tag: "assign",
      lvalue: { tag: "var", name: "a" },
      value: exprFromLiteral(1),
    });
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
      expr: { tag: "call", name: "print", args: [exprFromLiteral(1)], receiver: null },
    });
  });

  it("parses if statements", () => {
    verify("if True: pass", {
      tag: "if",
      cond: exprFromLiteral(true),
      then: [{ tag: "pass" }],
      else_: [],
    });
    verify("if True: pass\nelse: pass", {
      tag: "if",
      cond: exprFromLiteral(true),
      then: [{ tag: "pass" }],
      else_: [{ tag: "pass" }],
    });
    verify("if True: pass\nelif a: pass", {
      tag: "if",
      cond: exprFromLiteral(true),
      then: [{ tag: "pass" }],
      else_: [{ tag: "if", cond: namedVar("a"), then: [{ tag: "pass" }], else_: [] }],
    });
    verify("if True: pass\nelif a: pass\nelse: pass", {
      tag: "if",
      cond: exprFromLiteral(true),
      then: [{ tag: "pass" }],
      else_: [
        { tag: "if", cond: namedVar("a"), then: [{ tag: "pass" }], else_: [{ tag: "pass" }] },
      ],
    });
  });

  it("cannot parse more than one elif", () => {
    const source = `
if a:
    pass
elif b:
    pass
elif c:
    pass
else:
    pass`;
    const cursor = parser.parse(source).cursor();
    cursor.firstChild();
    expect(() => p.traverseStmt(source, cursor)).to.throw("more than one elif not supported");
  });
});
