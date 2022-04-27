import wabt from "wabt";
import { importObject } from "./import-object.test";
import { tcProgram } from "../tc";
import { compile, mathlib } from "../compiler";
import { parseProgram } from "../parser";
import { RuntimeError } from "../util";

// Modify typeCheck to return a `Type` as we have specified below
export function typeCheck(source: string): Type {
  const ast = parseProgram(source);
  const [, typ] = tcProgram(ast);
  switch (typ.tag) {
    case "int":
      return "int";
    case "bool":
      return "bool";
    case "none":
      return "none";
    case "object":
      return { tag: "object", class: typ.name };
  }
}

// Modify run to use `importObject` (imported above) to use for printing
// You can modify `importObject` to have any new fields you need here, or
// within another function in your compiler, for example if you need other
// JavaScript-side helpers
export async function run(source: string) {
  const wast = compile(source);
  const wabtApi = await wabt();

  console.log(wast);
  // Next three lines are wat2wasm
  const parsed = wabtApi.parseWat("example", wast);
  const binary = parsed.toBinary({});
  const memory = new WebAssembly.Memory({ initial: 10, maximum: 100 });
  const wasmModule = await WebAssembly.instantiate(binary.buffer, {
    js: { memory },
    imports: {
      ...importObject.imports,
      ...mathlib,
    },
  });

  // This next line is wasm-interp
  return (wasmModule.instance.exports as any)._start();
}

type Type = "int" | "bool" | "none" | { tag: "object"; class: string };

export const NUM: Type = "int";
export const BOOL: Type = "bool";
export const NONE: Type = "none";
export function CLASS(name: string): Type {
  return { tag: "object", class: name };
}
