import wabt from "wabt";
import { Stmt, Expr, Decl, BINOP_OPCODE } from "./ast";
import { parseProgram } from "./parser";
import { tcProgram, Classes } from "./tc";
import { RuntimeError } from "./util";

export const mathlib = {
  abs: Math.abs,
  max: Math.max,
  min: Math.min,
  pow: Math.pow,
  neg: (x: any) => -x,
  check_null: (x: any) => {
    if (x === 0) {
      throw new RuntimeError("null pointer dereference");
    }
    return x;
  },
};

export async function run(watSource: string, imports: any): Promise<number> {
  const wabtApi = await wabt();

  // Next three lines are wat2wasm
  const parsed = wabtApi.parseWat("example", watSource);
  const binary = parsed.toBinary({});
  const memory = new WebAssembly.Memory({ initial: 10, maximum: 100 });
  const wasmModule = await WebAssembly.instantiate(binary.buffer, { js: { memory }, imports });

  // This next line is wasm-interp
  return (wasmModule.instance.exports as any)._start();
}

export function codeGenExpr(expr: Expr, classdata: Classes): Array<string> {
  switch (expr.tag) {
    case "id": {
      const scope = expr.isGlobal ? "global" : "local";
      return [`(${scope}.get $${expr.name})`];
    }
    case "literal":
      const tsvalue = expr.value;
      let v: number;
      if (tsvalue.tag === "bool") {
        v = tsvalue.value ? 1 : 0;
      } else if (tsvalue.tag === "number") {
        v = tsvalue.value;
      } else {
        v = 0;
      }
      return [`(i32.const ${v})`];
    case "call": {
      const valStmts = expr.args.flatMap((e) => codeGenExpr(e, classdata));
      let funcname: string;
      let receiver: string[];
      if (expr.name === "print") {
        const argtype = expr.args[0].a.typ.tag;
        if (argtype === "func") {
          throw new TypeError("Cannot print a function");
        } else if (argtype === "object") {
          funcname = "print_int";
          receiver = [];
        } else {
          funcname = `print_${argtype}`;
          receiver = [];
        }
      } else if (expr.receiver !== null) {
        funcname = `${(expr.receiver.a.typ as any).name}$${expr.name}`;
        receiver = codeGenExpr(expr.receiver, classdata).concat([`(call $$check_null)`]);
      } else {
        funcname = expr.name;
        receiver = [];
      }
      return receiver.concat(valStmts, [`(call $${funcname})`]);
    }
    case "uniop":
      const arg = codeGenExpr(expr.value, classdata);
      // op can only be - or not
      const call = expr.op === "-" ? `(call $$neg)` : `(i32.eqz)`;
      return arg.concat([call]);
    case "binop": {
      const left = codeGenExpr(expr.left, classdata);
      const right = codeGenExpr(expr.right, classdata);
      const op = `(${BINOP_OPCODE[expr.op]})`;
      return left.concat(right, [op]);
    }
    case "field": {
      const obj = expr.expr;
      const objCode = codeGenExpr(obj, classdata);
      const off = classdata.get((obj.a.typ as any).name).offset.get(expr.name);
      return objCode.concat([`(call $$check_null)`, `(i32.load offset=${off})`]);
    }
  }
}

export function codeGenStmt(stmt: Stmt, classdata: Classes): Array<string> {
  switch (stmt.tag) {
    case "pass":
      return [];
    case "return":
      var valStmts = codeGenExpr(stmt.value, classdata);
      valStmts.push("return");
      return valStmts;
    case "assign": {
      const valStmts = codeGenExpr(stmt.value, classdata);
      const scope = stmt.isGlobal ? "global" : "local";
      if (stmt.lvalue.tag === "var") {
        return valStmts.concat([`(${scope}.set $${stmt.lvalue.name})`]);
      } else {
        const obj = stmt.lvalue.expr;
        const objCode = codeGenExpr(obj, classdata);
        const off = classdata.get((obj.a.typ as any).name).offset.get(stmt.lvalue.name);
        return [...objCode, `(call $$check_null)`, ...valStmts, `(i32.store offset=${off})`];
      }
    }
    case "expr":
      const result = codeGenExpr(stmt.expr, classdata);
      result.push("(local.set $scratch)");
      return result;
    case "if": {
      const cond = codeGenExpr(stmt.cond, classdata);
      const then = stmt.then.flatMap((s) => codeGenStmt(s, classdata));
      const else_ = stmt.else_.flatMap((s) => codeGenStmt(s, classdata));
      return cond.concat(["(if", "(then"], then, [")", "(else"], else_, [")", ")"]);
    }
  }
}

export function codeGenDecl(decl: Decl, classdata: Classes): string[] {
  switch (decl.tag) {
    case "class_def": {
      const cls = decl.decl;
      const methods = cls.methods.flatMap((func) => {
        const params = func.params.map((p) => `(param $${p.name} i32)`).join(" ");
        const defs = func.var_def.map((vd) => `(local $${vd.var_.name} i32)`);
        const inits = func.var_def.flatMap((vd) => {
          return codeGenExpr(vd.value, classdata).concat([`(local.set $${vd.var_.name})`]);
        });
        const stmts = func.body.flatMap((s) => codeGenStmt(s, classdata));
        return [].concat(
          [`(func $${cls.name}$${func.name} ${params} (result i32)`, "(local $scratch i32)"],
          defs,
          inits,
          stmts,
          ["(i32.const 0)", ")"]
        );
      });
      const fields = cls.fields.flatMap((f) => {
        const name = f.var_.name;
        const off = classdata.get(cls.name).offset.get(name);
        const init = codeGenExpr(f.value, classdata);
        return [`(global.get $$heap)`, `(i32.add (i32.const ${off}))`, ...init, `(i32.store)`];
      });
      const initf = cls.methods.some((m) => m.name === "__init__")
        ? `${cls.name}$__init__`
        : "object$__init__";
      const constructor = [
        `(func $${cls.name} (result i32)`,
        ...fields,
        `(global.get $$heap)`,
        `(global.get $$heap)`,
        `(global.get $$heap)`,
        `(i32.add (i32.const ${cls.fields.length * 4}))`,
        `(global.set $$heap)`,
        `(call $${initf})`,
        `(drop)`,
        `)`,
      ];
      return constructor.concat(methods);
    }
    case "var_def":
      const var_ = decl.decl;
      const init = codeGenExpr(var_.value, classdata);
      return [].concat([`(global $${var_.var_.name} (mut i32)`], init, [")"]);
  }
}

export function compile(source: string): string {
  const ast = parseProgram(source);
  const [cd] = tcProgram(ast);
  const decls = ast.decls.flatMap((d) => codeGenDecl(d, cd)).join("\n");
  const stmts = ast.stmts.flatMap((s) => codeGenStmt(s, cd)).join("\n");

  const lastStmt = ast.stmts[ast.stmts.length - 1];
  const isExpr = lastStmt?.tag === "expr";
  const retType = isExpr ? "(result i32)" : "";
  const retVal = isExpr ? "(local.get $scratch)" : "";

  return `(module
  (import "js" "memory" (memory 10))
  (func $print_int (import "imports" "print_num") (param i32) (result i32))
  (func $print_none (import "imports" "print_none") (param i32) (result i32))
  (func $print_bool (import "imports" "print_bool") (param i32) (result i32))
  (func $abs (import "imports" "abs") (param i32) (result i32))
  (func $max (import "imports" "max") (param i32) (param i32) (result i32))
  (func $min (import "imports" "min") (param i32) (param i32) (result i32))
  (func $pow (import "imports" "pow") (param i32) (param i32) (result i32))

  (func $$neg (import "imports" "neg") (param i32) (result i32))
  (func $$check_null (import "imports" "check_null") (param i32) (result i32))
  (func $object$__init__ (param $self i32) (result i32)
    (i32.const 0))
  (global $$heap (mut i32) (i32.const 4))
${decls}
  (func (export "_start") ${retType}
    (local $scratch i32)
${stmts}
${retVal}
  )
)
`;
}
