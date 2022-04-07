import { TreeCursor } from "lezer";
import { parser } from "lezer-python";
import { TypedVar, Stmt, Expr, Type, Decl, VarDef, Program, FuncDef, IfBranch } from "./ast";
import { exprFromLiteral, BINOP } from "./ast";
import { fmap_null } from "./util";

export class ParseError extends Error {
  constructor(message: string) {
    // ensure that the message includes ParseError
    super("ParseError: " + message);
    this.name = "ParseError";
  }
}

export function parseProgram(source: string): Program {
  const t = parser.parse(source).cursor();
  t.firstChild();
  const decls = traverseDecls(source, t);
  const stmts = traverseStmts(source, t);
  return { decls, stmts };
}

export function traverseDecls(s: string, t: TreeCursor): Decl[] {
  const decls = [];
  do {
    const d = traverseDecl(s, t);
    if (d === null) {
      break;
    }
    decls.push(d);
  } while (t.nextSibling());
  return decls;
}

export function traverseDecl(s: string, t: TreeCursor): Decl | null {
  if (t.type.name === "FunctionDefinition") {
    return {
      tag: "func_def",
      decl: traverseFuncDef(s, t),
    };
  } else if (t.type.name === "AssignStatement") {
    return fmap_null(traverseVarDef(s, t), (decl) => ({
      tag: "var_def",
      decl,
    }));
  } else {
    return null;
  }
}

export function traverseFuncDef(s: string, t: TreeCursor): FuncDef {
  if (t.type.name !== "FunctionDefinition") {
    throw new Error("expected FunctionDefinition");
  }
  t.firstChild();
  if (t.node.name === "async") {
    throw new ParseError("async functions not supported");
  }
  // parse function name
  t.nextSibling();
  const name = s.substring(t.from, t.to);

  // parse function parameters
  t.nextSibling();
  const params = traverseParameters(s, t);

  // parse return type
  t.nextSibling();
  let ret: Type;
  if (t.name === "TypeDef") {
    t.firstChild();
    t.nextSibling(); // skip the "->"
    ret = traverseType(s, t);
    t.parent();
  } else {
    ret = { tag: "none" };
  }

  // parse var def and function body
  t.nextSibling();
  t.firstChild();
  t.nextSibling(); // skip the ":"
  const var_def: VarDef[] = [];
  do {
    const d = traverseVarDef(s, t);
    if (d === null) {
      break;
    }
    var_def.push(d);
  } while (t.nextSibling());
  const body = traverseStmts(s, t);
  t.parent();

  t.parent();
  return { name, params, ret, var_def, body };
}

export function traverseVarDef(s: string, t: TreeCursor): VarDef | null {
  if (t.type.name !== "AssignStatement") {
    return null;
  }
  t.firstChild();
  const var_ = traverseTypedVar(s, t);
  if (var_ === null) {
    return null;
  }
  t.nextSibling(); // skip the "="
  t.nextSibling();
  const value = traverseExpr(s, t);
  t.parent();
  return { var_, value };
}

// VariableName "a" <- t
// TypeDef ": int"
//   : ":"
//   VariableName "int"
export function traverseTypedVar(s: string, t: TreeCursor): TypedVar | null {
  const name = s.substring(t.from, t.to);
  t.nextSibling(); // focus on type def
  if (t.type.name !== "TypeDef") {
    // missing type def
    return null;
  }
  t.firstChild();
  t.nextSibling(); // focus on type name
  const typ = traverseType(s, t);
  t.parent();
  return { name, typ };
}

export function traverseStmts(s: string, t: TreeCursor) {
  const stmts = [];
  do {
    stmts.push(traverseStmt(s, t));
  } while (t.nextSibling()); // t.nextSibling() returns false when it reaches
  //  the end of the list of children
  return stmts;
}

/*
  Invariant – t must focus on the same node at the end of the traversal
*/
export function traverseStmt(s: string, t: TreeCursor): Stmt {
  switch (t.type.name) {
    case "ReturnStatement":
      t.firstChild(); // Focus return keyword
      t.nextSibling(); // Focus expression
      var value = traverseExpr(s, t);
      t.parent();
      return { tag: "return", value };
    case "AssignStatement":
      t.firstChild(); // focused on name (the first child)
      var name = s.substring(t.from, t.to);
      t.nextSibling(); // focused on = sign. May need this for complex tasks, like +=!
      t.nextSibling(); // focused on the value expression
      var value = traverseExpr(s, t);
      t.parent();
      return { tag: "assign", name, value };
    case "ExpressionStatement":
      t.firstChild(); // The child is some kind of expression, the
      // ExpressionStatement is just a wrapper with no information
      var expr = traverseExpr(s, t);
      t.parent();
      return { tag: "expr", expr: expr };
    case "PassStatement":
      return { tag: "pass" };
    case "IfStatement":
      return traverseIfStmt(s, t);
    default:
      throw new Error("Invalid node type for stmt: " + t.type.name);
  }
}

/// traverse body with a colon
/// Body
///   :
///   Statement
export function traverseBody(s: string, t: TreeCursor): Stmt[] {
  if (t.type.name !== "Body") {
    throw new Error("expected Body");
  }
  t.firstChild();
  t.nextSibling(); // skip the colon
  const stmts = traverseStmts(s, t);
  t.parent();
  return stmts;
}

export function traverseIfStmt(s: string, t: TreeCursor): Stmt {
  t.firstChild();
  const branches: IfBranch[] = [];
  while (branches.length === 0 || t.type.name === "elif") {
    t.nextSibling(); // skip the "if" or "elif"
    const cond = traverseExpr(s, t);
    t.nextSibling();
    const body = traverseBody(s, t);
    t.nextSibling();
    branches.push({ cond, body });
  }

  let else_: Stmt[] = [];
  if (t.type.name === "else") {
    t.nextSibling();
    else_ = traverseBody(s, t);
  }

  t.parent();
  return { tag: "if", branches, else_ };
}

export function traverseType(s: string, t: TreeCursor): Type {
  switch (t.type.name) {
    case "VariableName":
      const name = s.substring(t.from, t.to);
      if (name !== "int" && name !== "bool") {
        throw new ParseError("Unknown type: " + name);
      }
      return { tag: name };
    default:
      throw new Error("Invalid node type for traverseType: " + t.type.name);
  }
}

export function traverseParameters(s: string, t: TreeCursor): Array<TypedVar> {
  t.firstChild(); // Focuses on open paren
  const parameters = [];
  t.nextSibling(); // Focuses on a VariableName
  while (t.type.name !== ")") {
    let name = s.substring(t.from, t.to);
    t.nextSibling(); // Focuses on "TypeDef", hopefully, or "," if mistake
    let nextTagName = t.type.name; // NOTE(joe): a bit of a hack so the next line doesn't if-split
    if (nextTagName !== "TypeDef") {
      throw new ParseError("Missed type annotation for parameter " + name);
    }
    t.firstChild(); // Enter TypeDef
    t.nextSibling(); // Focuses on type itself
    let typ = traverseType(s, t);
    t.parent();
    t.nextSibling(); // Move on to comma or ")"
    parameters.push({ name, typ });
    t.nextSibling(); // Focuses on a VariableName
  }
  t.parent(); // Pop to ParamList
  return parameters;
}

export function traverseExpr(s: string, t: TreeCursor): Expr {
  switch (t.type.name) {
    case "None":
      return exprFromLiteral(null);
    case "Number":
      return exprFromLiteral(Number(s.substring(t.from, t.to)));
    case "Boolean": {
      const v = s.substring(t.from, t.to) === "True" ? true : false;
      return exprFromLiteral(v);
    }
    case "VariableName":
      return { tag: "id", name: s.substring(t.from, t.to) };
    case "ParenthesizedExpression": {
      t.firstChild();
      t.nextSibling();
      const expr = traverseExpr(s, t);
      t.parent();
      return expr;
    }
    case "UnaryExpression": {
      t.firstChild();
      const op = s.substring(t.from, t.to);
      if (op != "-" && op != "not") {
        t.parent();
        throw new ParseError(`Unsupported UnaryExpression op (${op})`);
      }
      t.nextSibling();
      const arg = traverseExpr(s, t);
      t.parent();
      return { tag: "uniop", op, value: arg };
    }
    case "BinaryExpression": {
      t.firstChild();
      const left = traverseExpr(s, t);
      t.nextSibling(); // find the next argument in arglist
      const op = s.substring(t.from, t.to);
      t.nextSibling(); // find the next argument in arglist
      const right = traverseExpr(s, t);
      t.parent();
      if (BINOP.includes(op)) {
        return { tag: "binop", op, left, right };
      } else {
        throw new ParseError(`Invalid op ${op}`);
      }
    }
    case "CallExpression": {
      t.firstChild(); // Focus name
      const name = s.substring(t.from, t.to);
      t.nextSibling(); // Focus ArgList
      const args = traverseArguments(t, s);
      t.parent();
      return { tag: "call", name, args };
    }
    default:
      throw new Error("Invalid node type for expr: " + t.type.name);
  }
}

export function traverseArguments(c: TreeCursor, s: string): Expr[] {
  c.firstChild(); // Focuses on open paren
  const args = [];
  c.nextSibling();
  while (c.type.name !== ")") {
    let expr = traverseExpr(s, c);
    args.push(expr);
    c.nextSibling(); // Focuses on either "," or ")"
    c.nextSibling(); // Focuses on a VariableName
  }
  c.parent(); // Pop to ArgList
  return args;
}
