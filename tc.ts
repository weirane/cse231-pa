import { Expr, Program, Stmt, Decl, Type } from "./ast";
import { sameType, subType, BINOP_ARGS, BINOP_RETS, BINOP_VERB } from "./ast";
import { CompileError, TypeError } from "./util";

type Scope = Map<string, Type>[];

export type ClassData = {
  name: string;
  attrs: Map<string, Type>;
  offset: Map<string, number>;
};

export type Classes = Map<string, ClassData>;

function typeOfVar(name: string, scope: Scope): Type | null {
  for (let i = scope.length - 1; i >= 0; i--) {
    if (scope[i].has(name)) {
      return scope[i].get(name);
    }
  }
  return null;
}

export function tcExpr(e: Expr, scope: Scope, classdata: Classes): Type {
  function inner(e: Expr, scope: Scope): Type {
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
        // FIXME: only support two level scopes
        e.isGlobal = scope.length === 1 || !scope[1].has(e.name);
        return ty;
      }
      case "call": {
        let typ: Type;
        if (e.receiver !== null) {
          const objTy = tcExpr(e.receiver, scope, classdata);
          if (objTy.tag !== "object") {
            throw new TypeError(`Expected object but got ${objTy.tag}`);
          }
          const cls = objTy.name;
          if (!classdata.has(cls)) {
            // unreachable?
            throw new TypeError(`Undefined class ${cls}`);
          }
          const cd = classdata.get(cls);
          if (!cd.attrs.has(e.name)) {
            throw new TypeError(`Undefined method ${e.name} in class ${cls}`);
          }
          typ = cd.attrs.get(e.name);
          if (typ.tag !== "func") {
            throw new TypeError(`${cls}.${e.name} is not a method`);
          }
        } else {
          typ = typeOfVar(e.name, scope);
          if (typ === null) {
            throw new TypeError(`function ${e.name} not found`);
          }
          if (typ.tag !== "func") {
            throw new TypeError(`${e.name} is not a function`);
          }
        }
        if (typ.args.length !== e.args.length) {
          throw new TypeError(`Expected ${typ.args.length} arguments but got ${e.args.length}`);
        }
        for (const [i, arg] of e.args.entries()) {
          const argType = tcExpr(arg, scope, classdata);
          // special case for print
          if (e.name === "print") {
            return e.args[0].a.typ;
          }
          if (!subType(argType, typ.args[i])) {
            throw new TypeError(`Expected ${typ.args[i].tag} but got ${argType.tag}`);
          }
        }
        return typ.ret;
      }
      case "uniop":
        if (e.op === "not") {
          const argType = tcExpr(e.value, scope, classdata);
          if (argType.tag !== "bool") {
            throw new TypeError(`Expected bool with 'not' but got ${argType.tag}`);
          }
          return { tag: "bool" };
        } else if (e.op === "-") {
          const argType = tcExpr(e.value, scope, classdata);
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
        const leftType = tcExpr(e.left, scope, classdata);
        const rightType = tcExpr(e.right, scope, classdata);
        if (e.op === "is") {
          if (
            (leftType.tag === "object" || leftType.tag === "none") &&
            (rightType.tag === "object" || rightType.tag === "none")
          ) {
            // good
          } else {
            throw new TypeError(`Cannot \`is\` ${leftType.tag} with ${rightType.tag}`);
          }
        } else {
          if (!sameType(leftType, argType[0]) || !sameType(rightType, argType[1])) {
            const verb = BINOP_VERB[e.op];
            const showverb = verb === "compare" ? verb : `\`${verb}\``;
            throw new TypeError(`Cannot ${showverb} ${leftType.tag} with ${rightType.tag}`);
          }
        }
        return retType;
      }
      case "field": {
        const expr = tcExpr(e.expr, scope, classdata);
        if (expr.tag !== "object") {
          throw new TypeError(`Expected object but got ${expr.tag}`);
        }
        const cls = expr.name;
        if (!classdata.has(cls)) {
          // unreachable?
          throw new TypeError(`Undefined class ${cls}`);
        }
        const cd = classdata.get(cls);
        if (!cd.attrs.has(e.name)) {
          throw new TypeError(`Undefined field ${e.name} in class ${cls}`);
        }
        return cd.attrs.get(e.name);
      }
    }
  }
  const typ = inner(e, scope);
  e.a = { typ };
  return typ;
}

export function tcStmt(s: Stmt, scope: Scope, classdata: Classes, retType: Type | null) {
  switch (s.tag) {
    case "assign": {
      const rhsTy = tcExpr(s.value, scope, classdata);
      if (s.lvalue.tag === "var") {
        const ty = typeOfVar(s.lvalue.name, scope);
        if (ty === null) {
          throw new TypeError(`Undefined variable ${s.lvalue.name}`);
        }
        if (!subType(rhsTy, ty)) {
          throw new TypeError(`Cannot assign ${rhsTy.tag} to ${ty.tag}`);
        }
        if (!scope[scope.length - 1].has(s.lvalue.name)) {
          throw new CompileError(
            `Cannot assign variable that is not explicitly declared in this scope: ${s.lvalue.name}`
          );
        }
      } else if (s.lvalue.tag === "fieldas") {
        const obj = tcExpr(s.lvalue.expr, scope, classdata);
        if (obj.tag !== "object") {
          throw new TypeError(`Expected object but got ${obj.tag}`);
        }
        if (!classdata.has(obj.name)) {
          throw new TypeError(`Class ${obj.name} not found`);
        }
        const cd = classdata.get(obj.name);
        if (!cd.attrs.has(s.lvalue.name)) {
          throw new TypeError(`Undefined field ${s.lvalue.name} in class ${obj.name}`);
        }
        const fieldTy = cd.attrs.get(s.lvalue.name);
        if (fieldTy.tag === "func") {
          throw new TypeError(`Cannot assign to method`);
        }
        if (!subType(rhsTy, fieldTy)) {
          throw new TypeError(`Cannot assign ${rhsTy.tag} to ${fieldTy.tag}`);
        }
      } else {
        throw new Error(`Unknown lvalue type ${(s.lvalue as any).tag}`);
      }
      if (scope.length === 1) {
        s.isGlobal = true;
      }
      return;
    }
    case "expr": {
      tcExpr(s.expr, scope, classdata);
      return;
    }
    case "return": {
      if (retType === null) {
        throw new TypeError("Cannot return from top-level");
      }
      const valTyp = tcExpr(s.value, scope, classdata);
      if (!subType(valTyp, retType)) {
        throw new TypeError(`${valTyp.tag} returned but ${retType.tag} expected`);
      }
      return;
    }
    case "pass":
      return;
    case "if": {
      // check if condition is bool
      const condTy = tcExpr(s.cond, scope, classdata);
      if (condTy.tag !== "bool") {
        throw new TypeError(`Condition expression cannot be of type ${condTy.tag}`);
      }
      for (const stmt of s.then) {
        tcStmt(stmt, scope, classdata, retType);
      }
      for (const stmt of s.else_) {
        tcStmt(stmt, scope, classdata, retType);
      }
      return;
    }
  }
}

export function scopeFromDecls(decls: Decl[]): [Scope, Classes] {
  const topScope = new Map<string, Type>([
    ["print", { tag: "func", args: [{ tag: "int" }], ret: { tag: "none" } }],
  ]);
  const classdata = new Map<string, ClassData>();
  for (const def of decls) {
    if (def.tag === "class_def") {
      const cls = def.decl;
      const cd = {
        name: cls.name,
        attrs: new Map<string, Type>(),
        offset: new Map<string, number>(),
      };
      for (const [i, field] of cls.fields.entries()) {
        if (cd.attrs.has(field.var_.name)) {
          throw new CompileError(`Duplicate declaration of identifier ${field.var_.name}`);
        }
        cd.attrs.set(field.var_.name, field.var_.typ);
        cd.offset.set(field.var_.name, i * 4);
      }
      for (const meth of cls.methods) {
        if (cd.attrs.has(meth.name)) {
          throw new CompileError(`Duplicate declaration of identifier ${meth.name}`);
        }
        if (!sameType(meth.params[0].typ, { tag: "object", name: cls.name })) {
          throw new TypeError(`First parameter of method ${meth.name} must be of type ${cls.name}`);
        }
        cd.attrs.set(meth.name, {
          tag: "func",
          args: meth.params.slice(1).map((p) => p.typ),
          ret: meth.ret,
        });
      }
      classdata.set(cls.name, cd);
      topScope.set(cls.name, { tag: "func", args: [], ret: { tag: "object", name: cls.name } });
    } else {
      const tv = def.decl.var_;
      if (topScope.has(tv.name)) {
        throw new CompileError(`Duplicate declaration of identifier ${tv.name}`);
      }
      const initTyp = tcExpr(def.decl.value, [topScope], classdata);
      if (!subType(initTyp, tv.typ)) {
        throw new TypeError(`Cannot assign ${initTyp.tag} to ${tv.typ.tag}`);
      }
      topScope.set(tv.name, tv.typ);
    }
  }
  return [[topScope], classdata];
}

/// checks if a statement body returns in all control paths
export function blockReturns(s: Stmt[]): boolean {
  if (s.length === 0) {
    return false;
  }
  const last = s[s.length - 1];
  if (last.tag === "return") {
    return true;
  } else if (last.tag === "if") {
    return blockReturns(last.then) && blockReturns(last.else_);
  } else {
    return false;
  }
}

export function tcProgram(p: Program) {
  const [scope, classdata] = scopeFromDecls(p.decls);

  // type check function bodies
  for (const def of p.decls) {
    if (def.tag === "class_def") {
      const cls = def.decl;
      for (const func of cls.methods) {
        const bodyvars = new Map<string, Type>();
        func.params.concat(func.var_def.map((vd) => vd.var_)).forEach((tyvar) => {
          // check if arg is already defined
          if (bodyvars.has(tyvar.name)) {
            throw new CompileError(`Duplicate declaration of identifier ${tyvar.name}`);
          }
          bodyvars.set(tyvar.name, tyvar.typ);
        });
        scope.push(bodyvars);
        for (const stmt of func.body) {
          tcStmt(stmt, scope, classdata, func.ret);
        }
        // check for return type
        if (func.ret.tag !== "none" && !blockReturns(func.body)) {
          throw new TypeError("Function must return a value");
        }
        scope.pop();
      }
    }
  }

  for (const stmt of p.stmts) {
    tcStmt(stmt, scope, classdata, null);
  }
  return classdata;
}
