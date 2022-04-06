#!/usr/bin/env node
const python = require("lezer-python");
const process = require("process");

const input = process.argv[2] || "def f(x): return x + 2\nf(4)";

const tree = python.parser.parse(input);

const cursor = tree.cursor();

function print(c, depth) {
  // c: TreeCursor
  const name = `\b\x1b[33m${c.node.name}\x1b[m`;
  const content = `\x1b[32m"${input.substring(c.from, c.to)}"\x1b[m`;
  console.log("  ".repeat(depth), name, content);
  if (c.firstChild()) {
    do {
      print(c, depth + 1);
    } while (c.nextSibling());
    c.parent();
  }
}

print(cursor, 0);
