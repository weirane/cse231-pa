import wabt from "wabt";
import { Stmt, Expr, Decl, BINOP_OPCODE } from "./ast";
import { parseProgram } from "./parser";
import { tcProgram } from "./tc";

export const mathlib = {
  abs: Math.abs,
  max: Math.max,
  min: Math.min,
  pow: Math.pow,
  neg: (x: any) => -x,
};

export async function run(watSource: string, imports: any): Promise<number> {
  const wabtApi = await wabt();

  // Next three lines are wat2wasm
  const parsed = wabtApi.parseWat("example", watSource);
  const binary = parsed.toBinary({});
  const wasmModule = await WebAssembly.instantiate(binary.buffer, { imports });

  // This next line is wasm-interp
  return (wasmModule.instance.exports as any)._start();
}

export function codeGenExpr(expr: Expr): Array<string> {
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
      const valStmts = expr.args.flatMap(codeGenExpr);
      let funcname: string;
      if (expr.name === "print") {
        const argtype = expr.args[0].a.typ.tag;
        if (argtype === "func") {
          throw new TypeError("Cannot print a function");
        } else {
          funcname = `print_${argtype}`;
        }
      } else {
        funcname = expr.name;
      }
      return valStmts.concat([`(call $${funcname})`]);
    }
    case "uniop":
      const arg = codeGenExpr(expr.value);
      // op can only be - or not
      const call = expr.op === "-" ? `(call $$neg)` : `(i32.eqz)`;
      return arg.concat([call]);
    case "binop":
      const left = codeGenExpr(expr.left);
      const right = codeGenExpr(expr.right);
      let op: string[];
      if (expr.op === "is") {
        // pop two values and return true
        op = ["(drop)", "(drop)", "(i32.const 1)"];
      } else {
        op = [`(${BINOP_OPCODE[expr.op]})`];
      }
      return left.concat(right).concat(op);
  }
}

export function codeGenStmt(stmt: Stmt): Array<string> {
  switch (stmt.tag) {
    case "pass":
      return [];
    case "return":
      var valStmts = codeGenExpr(stmt.value);
      valStmts.push("return");
      return valStmts;
    case "assign": {
      const valStmts = codeGenExpr(stmt.value);
      const scope = stmt.isGlobal ? "global" : "local";
      return valStmts.concat([`(${scope}.set $${stmt.name})`]);
    }
    case "expr":
      const result = codeGenExpr(stmt.expr);
      result.push("(local.set $scratch)");
      return result;
    case "if": {
      const cond = codeGenExpr(stmt.cond);
      const then = stmt.then.flatMap(codeGenStmt);
      const else_ = stmt.else_.flatMap(codeGenStmt);
      return cond.concat(["(if", "(then"], then, [")", "(else"], else_, [")", ")"]);
    }
    case "while": {
      const cond = codeGenExpr(stmt.cond);
      const body = stmt.body.flatMap(codeGenStmt);
      return [].concat(["(loop"], cond, ["(if", "(then"], body, ["(br 1)", ")", ")", ")"]);
    }
  }
}

export function codeGenDecl(decl: Decl): string[] {
  switch (decl.tag) {
    case "func_def": {
      const func = decl.decl;
      const params = func.params.map((p) => `(param $${p.name} i32)`).join(" ");
      const defs = func.var_def.map((vd) => `(local $${vd.var_.name} i32)`);
      const inits = func.var_def.flatMap((vd) => {
        return codeGenExpr(vd.value).concat([`(local.set $${vd.var_.name})`]);
      });
      const stmts = func.body.map(codeGenStmt).flat();
      return [].concat(
        [`(func $${func.name} ${params} (result i32)`, "(local $scratch i32)"],
        defs,
        inits,
        stmts,
        ["(i32.const 0)", ")"]
      );
    }
    case "var_def":
      const var_ = decl.decl;
      const init = codeGenExpr(var_.value);
      return [].concat([`(global $${var_.var_.name} (mut i32)`], init, [")"]);
  }
}

export function compile(source: string): string {
  const ast = parseProgram(source);
  tcProgram(ast);
  const decls = ast.decls.flatMap(codeGenDecl).join("\n");
  const stmts = ast.stmts.flatMap(codeGenStmt).join("\n");

  const lastStmt = ast.stmts[ast.stmts.length - 1];
  const isExpr = lastStmt?.tag === "expr";
  const retType = isExpr ? "(result i32)" : "";
  const retVal = isExpr ? "(local.get $scratch)" : "";

  return `(module
  (func $print_int (import "imports" "print_int") (param i32) (result i32))
  (func $print_none (import "imports" "print_none") (param i32) (result i32))
  (func $print_bool (import "imports" "print_bool") (param i32) (result i32))
  (func $abs (import "imports" "abs") (param i32) (result i32))
  (func $max (import "imports" "max") (param i32) (param i32) (result i32))
  (func $min (import "imports" "min") (param i32) (param i32) (result i32))
  (func $pow (import "imports" "pow") (param i32) (param i32) (result i32))
  (func $$neg (import "imports" "neg") (param i32) (result i32))
${decls}
  (func (export "_start") ${retType}
    (local $scratch i32)
${stmts}
${retVal}
  )
)
`;
}
