export type Type =
  | { tag: "int" }
  | { tag: "bool" }
  | { tag: "none" }
  | { tag: "object"; name: string }
  | { tag: "func"; args: Type[]; ret: Type };

export type Program = { decls: Decl[]; stmts: Stmt[] };

export type Decl = { tag: "class_def"; decl: ClassDef } | { tag: "var_def"; decl: VarDef };

export type TypedVar = { name: string; typ: Type };

export type VarDef = { var_: TypedVar; value: Expr };

export type ClassDef = {
  name: string;
  fields: VarDef[];
  methods: FuncDef[];
};

export type FuncDef = {
  name: string;
  params: TypedVar[];
  ret: Type;
  var_def: VarDef[];
  body: Stmt[];
};

export type LValue = { tag: "var"; name: string } | { tag: "fieldas"; expr: Expr; name: string };

export type Stmt =
  | { tag: "assign"; lvalue: LValue; value: Expr; isGlobal?: boolean }
  | { tag: "if"; cond: Expr; then: Stmt[]; else_: Stmt[] }
  | { tag: "pass" }
  | { tag: "expr"; expr: Expr }
  | { tag: "return"; value: Expr };

export type EA = {
  typ: Type;
};

export type Expr =
  | { a?: EA; tag: "literal"; value: Literal }
  | { a?: EA; tag: "id"; name: string; isGlobal?: boolean }
  | { a?: EA; tag: "uniop"; op: string; value: Expr }
  | { a?: EA; tag: "binop"; op: string; left: Expr; right: Expr }
  | { a?: EA; tag: "call"; name: string; args: Expr[]; receiver: Expr | null }
  | { a?: EA; tag: "field"; expr: Expr; name: string };

export const BINOP = ["+", "-", "*", "//", "%", "==", "!=", "<=", ">=", "<", ">", "is"];

export const BINOP_ARGS: { [key: string]: Type[] } = {
  "+": [{ tag: "int" }, { tag: "int" }],
  "-": [{ tag: "int" }, { tag: "int" }],
  "*": [{ tag: "int" }, { tag: "int" }],
  "//": [{ tag: "int" }, { tag: "int" }],
  "%": [{ tag: "int" }, { tag: "int" }],
  "==": [{ tag: "int" }, { tag: "int" }],
  "!=": [{ tag: "int" }, { tag: "int" }],
  "<=": [{ tag: "int" }, { tag: "int" }],
  ">=": [{ tag: "int" }, { tag: "int" }],
  "<": [{ tag: "int" }, { tag: "int" }],
  ">": [{ tag: "int" }, { tag: "int" }],
  // from the spec: T1, T2 are not one of int, str, bool
  is: [{ tag: "none" }, { tag: "none" }],
};

export const BINOP_RETS: { [key: string]: Type } = {
  "+": { tag: "int" },
  "-": { tag: "int" },
  "*": { tag: "int" },
  "//": { tag: "int" },
  "%": { tag: "int" },
  "==": { tag: "bool" },
  "!=": { tag: "bool" },
  "<=": { tag: "bool" },
  ">=": { tag: "bool" },
  "<": { tag: "bool" },
  ">": { tag: "bool" },
  is: { tag: "bool" },
};

export const BINOP_VERB: { [key: string]: string } = {
  "+": "add",
  "-": "sub",
  "*": "mul",
  "//": "floordiv",
  "%": "mod",
  "==": "compare",
  "!=": "compare",
  "<=": "compare",
  ">=": "compare",
  "<": "compare",
  ">": "compare",
  is: "is",
};

export const BINOP_OPCODE: { [key: string]: string } = {
  "+": "i32.add",
  "-": "i32.sub",
  "*": "i32.mul",
  "//": "i32.div_s",
  "%": "i32.rem_s",
  "==": "i32.eq",
  "!=": "i32.ne",
  "<=": "i32.le_s",
  ">=": "i32.ge_s",
  "<": "i32.lt_s",
  ">": "i32.gt_s",
  is: "i32.eq",
};

export type Literal =
  | { tag: "number"; value: number }
  | { tag: "bool"; value: boolean }
  | { tag: "none" };

/// checks if t1 is a subtype of t2 (t1 is assignable to t2)
export function subType(t1: Type, t2: Type): boolean {
  if (t1.tag === t2.tag) {
    if (t1.tag === "func" && t2.tag === "func") {
      return (
        t1.args.length === t2.args.length &&
        subType(t1.ret, t2.ret) &&
        t1.args.every((_, i) => subType(t2.args[i], t1.args[i]))
      );
    } else if (t1.tag === "object" && t2.tag === "object") {
      return t1.name === t2.name;
    } else {
      return true;
    }
  } else {
    return t1.tag === "none" && t2.tag === "object";
  }
}

export function sameType(t1: Type, t2: Type): boolean {
  if (t1.tag !== t2.tag) {
    return false;
  }
  if (t1.tag === "func" && t2.tag === "func") {
    return (
      t1.args.length === t2.args.length &&
      sameType(t1.ret, t2.ret) &&
      t1.args.every((_, i) => sameType(t1.args[i], t2.args[i]))
    );
  } else if (t1.tag === "object" && t2.tag === "object") {
    return t1.name === t2.name;
  } else {
    return true;
  }
}

export function namedVar(name: string): Expr {
  return { tag: "id", name };
}

export function intTypedVar(s: string): TypedVar {
  return { name: s, typ: { tag: "int" } };
}

export function boolTypedVar(s: string): TypedVar {
  return { name: s, typ: { tag: "bool" } };
}

export function classVar(cls: string, s: string): TypedVar {
  return { name: s, typ: { tag: "object", name: cls } };
}

export function exprFromLiteral(value: number | boolean | null): Expr {
  if (value === null) {
    return { tag: "literal", value: { tag: "none" } };
  } else if (typeof value === "number") {
    return { tag: "literal", value: { tag: "number", value } };
  } else {
    return { tag: "literal", value: { tag: "bool", value } };
  }
}
