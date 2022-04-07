export type Type =
  | { tag: "int" }
  | { tag: "bool" }
  | { tag: "none" }
  | { tag: "func"; args: Type[]; ret: Type };

export type Program = { decls: Decl[]; stmts: Stmt[] };

export type Decl = { tag: "func_def"; decl: FuncDef } | { tag: "var_def"; decl: VarDef };

export type TypedVar = { name: string; typ: Type };

export type VarDef = { var_: TypedVar; value: Expr };

export type FuncDef = {
  name: string;
  params: TypedVar[];
  ret: Type;
  var_def: VarDef[];
  body: Stmt[];
};

export type Stmt =
  | { tag: "assign"; name: string; value: Expr }
  | { tag: "if"; branches: IfBranch[]; else_: Stmt[] }
  | { tag: "while"; cond: Expr; body: Stmt[] }
  | { tag: "pass" }
  | { tag: "expr"; expr: Expr }
  | { tag: "return"; value: Expr };

export type IfBranch = { cond: Expr; body: Stmt[] };

export type Expr =
  | { tag: "literal"; value: Literal }
  | { tag: "id"; name: string }
  | { tag: "uniop"; op: string; value: Expr }
  | { tag: "binop"; op: string; left: Expr; right: Expr }
  | { tag: "call"; name: string; args: Expr[] };

export const BINOP = ["+", "-", "*", "//", "%", "==", "!=", "<=", ">=", "<", ">", "is"];

export type Literal =
  | { tag: "number"; value: number }
  | { tag: "bool"; value: boolean }
  | { tag: "none" };

export function namedVar(name: string): Expr {
  return { tag: "id", name };
}

export function intTypedVar(s: string): TypedVar {
  return { name: s, typ: { tag: "int" } };
}

export function boolTypedVar(s: string): TypedVar {
  return { name: s, typ: { tag: "bool" } };
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
