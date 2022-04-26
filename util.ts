export function fmap_null<I, O>(v: I | null, f: (x: I) => O): O | null {
  return v === null ? null : f(v);
}

export class TypeError extends Error {
  constructor(message: string) {
    super("TYPE ERROR: " + message);
    this.name = "TypeError";
  }
}

export class CompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompileError";
  }
}

export class RuntimeError extends Error {
  constructor(message: string) {
    super("RUNTIME ERROR: " + message);
    this.name = "RuntimeError";
  }
}
