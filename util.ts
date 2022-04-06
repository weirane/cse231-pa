export function fmap_null<I, O>(v: I | null, f: (x: I) => O): O | null {
  return v === null ? null : f(v);
}
