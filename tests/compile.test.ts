import { assertPrint, assertFail } from "./asserts.test";

describe("object", () => {
  assertPrint(
    "ensures it calls the init method",
    `
class Foo(object):
  x: int = 0
  def __init__(self: Foo):
    self.x = self.x + 1
  def bar(self: Foo) -> int:
    return self.x
f: Foo = None
f = Foo()
print(f.bar())`,
    ["1"]
  );

  assertFail(
    "segfault when calling on none",
    `
class Foo(object):
  def bar(self: Foo) -> int:
    return 0
f: Foo = None
f.bar()`
  );
});
