import { TreeCursor } from "lezer";
import { parser } from "lezer-python";
import {
  TypedVar,
  Stmt,
  Expr,
  Type,
  Decl,
  VarDef,
  Program,
  FuncDef,
  ClassDef,
  LValue,
} from "./ast";
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
  if (!t.firstChild()) {
    return { decls: [], stmts: [] };
  }
  const decls = [];
  do {
    const d = traverseDecl(source, t);
    if (d === null) {
      // declarations done
      const stmts = traverseStmts(source, t);
      return { decls, stmts };
    }
    decls.push(d);
  } while (t.nextSibling());
  return { decls, stmts: [] };
}

export function traverseDecl(s: string, t: TreeCursor): Decl | null {
  if (t.type.name === "ClassDefinition") {
    return {
      tag: "class_def",
      decl: traverseClassDef(s, t),
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

export function traverseClassDef(s: string, t: TreeCursor): ClassDef {
  t.firstChild();
  t.nextSibling(); // skip the "class"
  const name = s.substring(t.from, t.to);
  t.nextSibling(); // skip the name
  t.nextSibling(); // skip the superclass
  t.firstChild(); // enter the body
  t.nextSibling(); // skip the :
  const methods: FuncDef[] = [];
  const fields: VarDef[] = [];
  do {
    if (t.name === "FunctionDefinition") {
      methods.push(traverseFuncDef(s, t));
    } else if (t.name === "AssignStatement") {
      fields.push(traverseVarDef(s, t));
    } else {
      throw new ParseError("unexpected node type " + t.name);
    }
  } while (t.nextSibling());
  t.parent();
  t.parent();
  return { name, fields, methods };
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
  // special restrictions
  if (params.length === 0 || params[0].name !== "self") {
    throw new ParseError("First parameter must be self");
  }
  return { name, params, ret, var_def, body };
}

export function traverseVarDef(s: string, t: TreeCursor): VarDef | null {
  if (t.type.name !== "AssignStatement") {
    return null;
  }
  t.firstChild();
  const var_ = traverseTypedVar(s, t);
  if (var_ === null) {
    t.parent();
    return null;
  }
  t.nextSibling(); // skip the "="
  t.nextSibling();
  const value = traverseExpr(s, t);
  t.parent();
  if (value.tag !== "literal") {
    throw new ParseError("Can only initialize with literal");
  }
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
    case "ReturnStatement": {
      t.firstChild(); // Focus return keyword
      t.nextSibling(); // Focus expression
      const value = t.name === "⚠" ? exprFromLiteral(null) : traverseExpr(s, t);
      t.parent();
      return { tag: "return", value };
    }
    case "AssignStatement": {
      t.firstChild(); // focused on name (the first child)
      let lvalue: LValue;
      if (t.name === "MemberExpression") {
        t.firstChild();
        const expr = traverseExpr(s, t);
        t.nextSibling(); // skip the "."
        t.nextSibling();
        const name = s.substring(t.from, t.to);
        t.parent();
        lvalue = { tag: "fieldas", expr, name };
      } else if (t.name === "VariableName") {
        const name = s.substring(t.from, t.to);
        lvalue = { tag: "var", name };
      } else {
        throw new ParseError("unexpected node type in lvalue: " + t.name);
      }
      t.nextSibling(); // focused on = sign. May need this for complex tasks, like +=!
      t.nextSibling(); // focused on the value expression
      const value = traverseExpr(s, t);
      t.parent();
      return { tag: "assign", lvalue, value };
    }
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
  if (t.name !== "if") {
    throw new Error("expecting an if node");
  }
  t.nextSibling(); // skip the "if" or "elif"
  const cond = traverseExpr(s, t);
  t.nextSibling();
  const then = traverseBody(s, t);
  t.nextSibling();
  const else_ = traverseElseBranch(s, t, 1);
  t.parent();
  return { tag: "if", cond, then, else_ };
}

function traverseElseBranch(s: string, t: TreeCursor, depth: number): Stmt[] {
  if (depth > 2) {
    throw new ParseError("more than one elif not supported");
  }
  if (t.type.name === "elif") {
    t.nextSibling(); // skip the "if" or "elif"
    const cond = traverseExpr(s, t);
    t.nextSibling();
    const then = traverseBody(s, t);
    t.nextSibling();
    const else_ = traverseElseBranch(s, t, depth + 1);
    return [{ tag: "if", cond, then, else_ }];
  } else if (t.type.name === "else") {
    t.nextSibling();
    return traverseBody(s, t);
  } else if (t.type.name === "Body") {
    // reached the end
    return [];
  } else {
    throw new Error("unexpected node type " + t.type.name);
  }
}

export function traverseType(s: string, t: TreeCursor): Type {
  switch (t.type.name) {
    case "VariableName":
      const name = s.substring(t.from, t.to);
      if (name !== "int" && name !== "bool") {
        return { tag: "object", name };
      } else {
        return { tag: name };
      }
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
      t.nextSibling();
      if (t.name === "⚠") {
        throw new ParseError("unmatched parenthesis");
      }
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
      let receiver: Expr | null;
      let name: string;
      if (t.name === "VariableName") {
        receiver = null;
        name = s.substring(t.from, t.to);
      } else if (t.name === "MemberExpression") {
        t.firstChild();
        receiver = traverseExpr(s, t);
        t.nextSibling(); // skip the .
        t.nextSibling();
        name = s.substring(t.from, t.to);
        t.parent();
      } else {
        throw new Error("Invalid CallExpression " + t.name);
      }
      t.nextSibling(); // Focus ArgList
      const args = traverseArguments(t, s);
      t.parent();
      // special restrictions
      if (receiver === null) {
        if (name === "print") {
          if (args.length !== 1) {
            throw new ParseError("print takes exactly one argument");
          }
        } else {
          if (args.length !== 0) {
            throw new ParseError("constructors take no arguments");
          }
        }
      }
      return { tag: "call", name, args, receiver };
    }
    case "MemberExpression": {
      t.firstChild();
      const expr = traverseExpr(s, t);
      t.nextSibling(); // skip the .
      t.nextSibling();
      const name = s.substring(t.from, t.to);
      t.parent();
      return { tag: "field", expr, name };
    }
    default:
      throw new Error("Invalid node type for expr: " + t.type.name);
  }
}

export function traverseArguments(c: TreeCursor, s: string): Expr[] {
  c.firstChild(); // Focuses on open paren
  const args = [];
  c.nextSibling();
  while (c.type.name !== ")" && c.type.name !== "⚠") {
    let expr = traverseExpr(s, c);
    args.push(expr);
    c.nextSibling(); // Focuses on either "," or ")"
    c.nextSibling(); // Focuses on a VariableName
  }
  if (c.type.name === "⚠") {
    throw new ParseError("unmatched parenthesis");
  }
  c.parent(); // Pop to ArgList
  return args;
}
