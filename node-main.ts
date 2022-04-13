import { compile, run, mathlib } from "./compiler";

// command to run:
// node node-main.js 987
const input = process.argv[2];
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
