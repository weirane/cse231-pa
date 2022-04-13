import { compile, run, mathlib } from "./compiler";
import fs from "fs";

// command to run:
// node node-main.js 987
const a2 = process.argv[2];
const input = a2 === "" ? fs.readFileSync(process.argv[3], "utf8") : a2;
const result = compile(input);
console.log(result);
const imports = {
  print_int: (arg: any) => {
    console.log(arg);
    return arg;
  },
  print_none: (arg: any) => {
    console.log("None");
    return arg;
  },
  print_bool: (arg: any) => {
    console.log(arg === 0 ? "False" : "True");
    return arg;
  },
  ...mathlib,
};
run(result, imports).then((value) => {
  console.log(value);
});
