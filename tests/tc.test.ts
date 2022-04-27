import { assert, expect } from "chai";
import * as t from "../tc";
import { parseProgram } from "../parser";
import { Type } from "../ast";

describe("typecheck expressions", () => {
  const verifyThrows = (scope: string, code: string, message: any) => {
    const s = parseProgram(code).stmts[0];
    if (s.tag !== "expr") {
      assert.fail("first stmt should be expr");
    }
    const [sc, cd] = t.scopeFromDecls(parseProgram(scope).decls);
    expect(() => t.tcExpr(s.expr, sc, cd)).to.throw(message);
  };
  const verifySucc = (scope: string, code: string, ty: Type) => {
    const s = parseProgram(code).stmts[0];
    if (s.tag !== "expr") {
      assert.fail("first stmt should be expr");
    }
    const [sc, cd] = t.scopeFromDecls(parseProgram(scope).decls);
    expect(t.tcExpr(s.expr, sc, cd)).to.deep.equal(ty);
  };
  const itVerifies = (msg: string, scope: string, code: string, ty: Type) => {
    it(msg, () => verifySucc(scope, code, ty));
  };
  const itVerifyThrows = (msg: string, scope: string, code: string, message: any) => {
    it(msg, () => verifyThrows(scope, code, message));
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

  it("checks function calls", () => {
    const scope = `
foo: Foo = None
class Foo:
  i1: int = 0
  i2: int = 2
  b1: bool = False
  def f(self: Foo, i: int, b: bool) -> int:
    if b:
      return i
    else:
      return 0`;
    verifyThrows(scope, "foo.g()", "Undefined method g in class Foo");
    verifyThrows(scope, "foo.i2()", "Foo.i2 is not a method");
    verifyThrows(scope, "foo.f()", "Expected 2 arguments but got 0");
    verifyThrows(scope, "foo.f(foo.i1)", "Expected 2 arguments but got 1");
    verifyThrows(scope, "foo.f(foo.b1, foo.b1)", "Expected int but got bool");

    verifySucc(scope, "foo.f(foo.i1, foo.b1)", { tag: "int" });
    verifySucc(scope, "foo.f(0, foo.b1)", { tag: "int" });
    verifySucc(scope, "foo.f(foo.f(0, False), foo.b1)", { tag: "int" });
  });

  const scope = `
foo: Foo = None
gi1: int = 0
gi2: int = 2
gb1: bool = False
class Foo:
  i1: int = 0
  i2: int = 2
  b1: bool = False
  def f(self: Foo, i: int, b: bool) -> int:
    if b:
      return i
    else:
      return 0`;
  itVerifies("checks field accesses", scope, "foo.i1", { tag: "int" });
  itVerifies("checks method calls", scope, "foo.f(gi1, gb1)", { tag: "int" });
  itVerifyThrows("ensures field access on object", scope, "gi1.i1", "Expected object but got int");
  itVerifyThrows(
    "ensures field accessed are defined",
    scope,
    "foo.x",
    "Undefined field x in class Foo"
  );
  itVerifyThrows(
    "ensures receiver to be an object",
    scope,
    "gi1.f()",
    "Expected object but got int"
  );
  itVerifyThrows(
    "ensures methods are defined",
    scope,
    "foo.g()",
    "Undefined method g in class Foo"
  );
  itVerifyThrows("ensures fields cannot be called", scope, "foo.i2()", "Foo.i2 is not a method");
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
  const itVerifies = (msg: string, scope: string, code: string) => {
    it(msg, () => {
      const s = parseProgram(code).stmts[0];
      const [sc, cd] = t.scopeFromDecls(parseProgram(scope).decls);
      t.tcStmt(s, sc, cd, null);
    });
  };
  const itVerifyThrows = (msg: string, scope: string, code: string, message: any) => {
    it(msg, () => {
      const s = parseProgram(code).stmts[0];
      const [sc, cd] = t.scopeFromDecls(parseProgram(scope).decls);
      expect(() => t.tcStmt(s, sc, cd, null)).to.throw(message);
    });
  };

  it("checks init/assigns", () => {
    verifyThrows(`f: bool = 0`, "Cannot assign");
    verifyThrows(`f: bool = False\nf = 0`, "Cannot assign");
    verifyThrows(
      `
class Foo(object):
  def f(self: Foo, a: int):
    a = False`,
      "Cannot assign"
    );
    verifyThrows(
      `
class Foo(object):
  def f(self: Foo, a: int):
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
  b = 1`,
      "Condition expression cannot be of type int"
    );
    verifyThrows(
      `
class Foo(object):
  def f(self: Foo):
    pass
if Foo().f():
  pass`,
      "Condition expression cannot be of type none"
    );
  });

  it("checks the return type", () => {
    verifyThrows(
      `
class Foo(object):
  def a(self: Foo):
    return 1`,
      "int returned but none expected"
    );
    verifyThrows(
      `
class Foo(object):
  def a(self: Foo) -> int:
    pass`,
      "Function must return a value"
    );
    verifyThrows(
      `
class Foo(object):
  def a(self: Foo) -> int:
    x: int = 0
    if x == 0:
      return 1
    else:
      pass`,
      "Function must return a value"
    );
    verifyThrows(
      `
class Foo(object):
  def a(self: Foo) -> int:
    x: int = 0
    if x == 0:
      return 1
    else:
      return`,
      "none returned but int expected"
    );
    verifyThrows(
      `
class Foo(object):
  def a(self: Foo) -> int:
    x: int = 0
    if x == 0:
      return 1`,
      "Function must return a value"
    );
    verifyThrows(
      `
class Foo(object):
  def a(self: Foo) -> int:
    x: int = 0
    if x == 0:
      return 1
    else:
      return False`,
      "bool returned but int expected"
    );
    verifySucc(
      `
class Foo(object):
  def a(self: Foo) -> int:
    x: int = 0
    return x`
    );
    verifySucc(
      `
class Foo(object):
  def a(self: Foo) -> int:
    x: int = 0
    if x == 0:
      return 1
    else:
      return 2`
    );
    verifySucc(
      `
class Foo(object):
  def a(self: Foo) -> int:
    x: int = 0
    if x == 0:
      return 1
    elif x == 1:
      return 2
    else:
      return 3`
    );
  });

  it("doesn't allow assign to variables in the outer scope", () => {
    verifyThrows(
      `
x: int = 0
class Foo(object):
  def f(self: Foo):
    x = 3`,
      "Cannot assign variable that is not explicitly declared in this scope"
    );
  });

  const scope = `
foo: Foo = None
gi1: int = 0
gi2: int = 2
gb1: bool = False
class Foo:
  i1: int = 0
  i2: int = 2
  b1: bool = False
  def f(self: Foo, i: int, b: bool) -> int:
    if b:
      return i
    else:
      return 0`;
  itVerifies("allows assign None to object", scope, "foo = None");
  itVerifies("allows assign constructor to object", scope, "foo = Foo()");
  itVerifies("checks field assigns", scope, "foo.i1 = 0");
  itVerifyThrows(
    "ensures field access on object",
    scope,
    "gi1.i1 = 0",
    "Expected object but got int"
  );
  itVerifyThrows(
    "ensures field accessed are defined",
    scope,
    "foo.x = 0",
    "Undefined field x in class Foo"
  );
  itVerifyThrows("doesn't allow assign to methods", scope, "foo.f = 0", "Cannot assign to method");
});

describe("typecheck declarations", () => {
  const itVerifyThrows = (msg: string, code: string, message: any) => {
    it(msg, () => {
      const p = parseProgram(code);
      expect(() => t.tcProgram(p)).to.throw(message);
    });
  };

  itVerifyThrows(
    "checks the type of self",
    `
class C:
  def f(self: D):
    pass`,
    "First parameter of method f must be of type C"
  );

  itVerifyThrows(
    "ensures one argument for __init__",
    `
class C:
  def __init__(self: C, a: int, b: int):
    pass`,
    "C.__init__ should have exactly one argument"
  );
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
class Foo(object):
  def f(self: Foo):
    pass
  f: int = 0`,
      "Duplicate declaration"
    );
    verifyThrows(
      `
class Foo(object):
  f: int = 0
  def f(self: Foo):
    pass`,
      "Duplicate declaration"
    );
    verifyThrows(
      `
class Foo(object):
  def f(self: Foo):
    pass
  def f(self: Foo):
    pass`,
      "Duplicate declaration"
    );

    verifyThrows(
      `
class Foo(object):
  def f(self: Foo, a: int, a: int):
    pass`,
      "Duplicate declaration"
    );
    verifyThrows(
      `
class Foo(object):
  def f(self: Foo, a: int, b: int):
    a: int = 0
    pass`,
      "Duplicate declaration"
    );
    verifyThrows(
      `
class Foo(object):
  def f(self: Foo, a: int):
    b: int = 0
    b: int = 0
    pass`,
      "Duplicate declaration"
    );
  });
});
