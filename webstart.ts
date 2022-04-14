import { compile, run, mathlib } from "./compiler";

(window as any)["runWat"] = run;

const imports = {
  print_int: (arg: any) => {
    console.log("Logging from WASM: ", arg);
    const output = document.getElementById("output");
    output.innerText += arg + "\n";
    return arg;
  },
  print_none: (arg: any) => {
    console.log("Logging from WASM: ", arg);
    const output = document.getElementById("output");
    output.innerText += "None\n";
    return arg;
  },
  print_bool: (arg: any) => {
    console.log("Logging from WASM: ", arg);
    const output = document.getElementById("output");
    output.innerText += arg === 0 ? "False\n" : "True\n";
    return arg;
  },
  ...mathlib,
};

document.addEventListener("DOMContentLoaded", async () => {
  const runButton = document.getElementById("run");
  const userCode = document.getElementById("user-code") as HTMLTextAreaElement;
  runButton.addEventListener("click", async () => {
    const output = document.getElementById("output");
    output.innerText = "";
    const program = userCode.value;
    const ret = document.getElementById("return");
    try {
      const wat = compile(program);
      console.log(wat);
      const result = await run(wat, imports);
      ret.textContent = String(result);
      ret.setAttribute("style", "color: black");
    } catch (e) {
      console.error(e);
      ret.textContent = String(e);
      ret.setAttribute("style", "color: red");
    }
  });

  userCode.value = localStorage.getItem("program");
  userCode.addEventListener("keypress", async () => {
    localStorage.setItem("program", userCode.value);
  });
});
