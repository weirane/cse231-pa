import { Expr, Program, Stmt, Decl, Type } from "./ast";
import { sameType, BINOP_ARGS, BINOP_RETS, BINOP_VERB } from "./ast";
import { CompileError, TypeError } from "./util";

type Scope = Map<string, Type>[];

function typeOfVar(name: string, scope: Scope): Type | null {
  for (let i = scope.length - 1; i >= 0; i--) {
    if (scope[i].has(name)) {
      return scope[i].get(name);
    }
  }
  return null;
}

export function tcExpr(e: Expr, scope: Scope): Type {
  switch (e.tag) {
    case "literal":
      switch (e.value.tag) {
        case "number":
          return { tag: "int" };
        case "bool":
          return { tag: "bool" };
        case "none":
          return { tag: "none" };
      }
    case "id": {
      const ty = typeOfVar(e.name, scope);
      if (ty === null) {
        throw new TypeError(`Undefined variable ${e.name}`);
      }
      return ty;
    }
    case "call": {
      const typ = typeOfVar(e.name, scope);
      if (typ === null) {
        throw new TypeError(`function ${e.name} not found`);
      }
      if (typ.tag !== "func") {
        throw new TypeError(`${e.name} is not a function`);
      }
      if (typ.args.length !== e.args.length) {
        throw new TypeError(`Expected ${typ.args.length} arguments but got ${e.args.length}`);
      }
      for (const [i, arg] of e.args.entries()) {
        const argType = tcExpr(arg, scope);
        if (!sameType(argType, typ.args[i])) {
          throw new TypeError(`Expected ${typ.args[i]} but got ${argType}`);
        }
      }
      return typ.ret;
    }
    case "uniop":
      if (e.op === "not") {
        const argType = tcExpr(e.value, scope);
        if (argType.tag !== "bool") {
          throw new TypeError(`Expected bool with 'not' but got ${argType.tag}`);
        }
        return { tag: "bool" };
      } else if (e.op === "-") {
        const argType = tcExpr(e.value, scope);
        if (argType.tag !== "int") {
          throw new TypeError(`Expected int with '-' but got ${argType.tag}`);
        }
        return { tag: "int" };
      } else {
        throw new Error(`Unknown unary operator ${e.op}`);
      }
    case "binop": {
      const argType = BINOP_ARGS[e.op];
      if (argType === undefined) {
        throw new Error(`Unknown binary operator ${e.op}`);
      }
      const retType = BINOP_RETS[e.op];
      const leftType = tcExpr(e.left, scope);
      const rightType = tcExpr(e.right, scope);
      const verb = BINOP_VERB[e.op];
      if (!sameType(leftType, argType[0]) || !sameType(rightType, argType[1])) {
        const showverb = verb === "compare" ? verb : `\`${verb}\``;
        throw new TypeError(`Cannot ${showverb} ${leftType.tag} with ${rightType.tag}`);
      }
      return retType;
    }
  }
}

export function tcStmt(s: Stmt, scope: Scope, retType: Type | null) {
  switch (s.tag) {
    case "assign": {
      const rhsTy = tcExpr(s.value, scope);
      const ty = typeOfVar(s.name, scope);
      if (ty === null) {
        throw new TypeError(`Undefined variable ${s.name}`);
      }
      if (!sameType(ty, rhsTy)) {
        throw new TypeError(`Cannot assign ${rhsTy.tag} to ${ty.tag}`);
      }
      return;
    }
    case "expr": {
      tcExpr(s.expr, scope);
      return;
    }
    case "return": {
      if (retType === null) {
        throw new TypeError("Cannot return from top-level");
      }
      const valTyp = tcExpr(s.value, scope);
      if (valTyp !== retType) {
        throw new TypeError(`${valTyp} returned but ${retType} expected`);
      }
      return;
    }
    case "pass":
      return;
    case "if": {
      for (const branch of s.branches) {
        // check if condition is bool
        const condTy = tcExpr(branch.cond, scope);
        if (condTy.tag !== "bool") {
          throw new TypeError(`Condition expression cannot be of type ${condTy.tag}`);
        }
        for (const stmt of branch.body) {
          tcStmt(stmt, scope, retType);
        }
      }
      for (const stmt of s.else_) {
        tcStmt(stmt, scope, retType);
      }
      return;
    }
    case "while": {
      // check if condition is bool
      const condTy = tcExpr(s.cond, scope);
      if (condTy.tag !== "bool") {
        throw new TypeError(`Condition expression cannot be of type ${condTy.tag}`);
      }
      for (const stmt of s.body) {
        tcStmt(stmt, scope, retType);
      }
    }
  }
}

export function scopeFromDecls(decls: Decl[]): Scope {
  const topScope = new Map<string, Type>();
  for (const def of decls) {
    if (def.tag === "func_def") {
      const func = def.decl;
      if (topScope.has(func.name)) {
        throw new CompileError(`Duplicate declaration of identifier ${func.name}`);
      }
      const ty = {
        tag: "func" as const,
        args: func.params.map((p) => p.typ),
        ret: func.ret,
      };
      topScope.set(func.name, ty);
    } else {
      const tv = def.decl.var_;
      if (topScope.has(tv.name)) {
        throw new CompileError(`Duplicate declaration of identifier ${tv.name}`);
      }
      const initTyp = tcExpr(def.decl.value, [topScope]);
      if (!sameType(initTyp, tv.typ)) {
        throw new TypeError(`Cannot assign: ${tv.typ.tag} expected but ${initTyp.tag} found`);
      }
      topScope.set(tv.name, tv.typ);
    }
  }
  return [topScope];
}

export function tcProgram(p: Program) {
  const scope = scopeFromDecls(p.decls);

  // type check function bodies
  for (const def of p.decls) {
    if (def.tag === "func_def") {
      const func = def.decl;
      const bodyvars = new Map<string, Type>();
      for (const arg of func.params) {
        // check if arg is already defined
        if (bodyvars.has(arg.name)) {
          throw new CompileError(`Duplicate declaration of identifier ${arg.name}`);
        }
        bodyvars.set(arg.name, arg.typ);
      }
      for (const vardef of func.var_def) {
        if (bodyvars.has(vardef.var_.name)) {
          throw new CompileError(`Duplicate declaration of identifier ${vardef.var_.name}`);
        }
        bodyvars.set(vardef.var_.name, vardef.var_.typ);
      }
      scope.push(bodyvars);
      for (const stmt of func.body) {
        tcStmt(stmt, scope, func.ret);
      }
      scope.pop();
    }
  }

  for (const stmt of p.stmts) {
    tcStmt(stmt, scope, null);
  }
}
