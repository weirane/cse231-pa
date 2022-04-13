import { compile, run, mathlib } from "./compiler";

(window as any)["runWat"] = run;

const imports = {
  print_int: (arg: any) => {
    console.log("Logging from WASM: ", arg);
    const elt = document.createElement("pre");
    document.getElementById("output").appendChild(elt);
    elt.innerText = arg;
    return arg;
  },
  print_none: (arg: any) => {
    console.log("Logging from WASM: ", arg);
    const elt = document.createElement("pre");
    document.getElementById("output").appendChild(elt);
    elt.innerText = "None";
    return arg;
  },
  print_bool: (arg: any) => {
    console.log("Logging from WASM: ", arg);
    const elt = document.createElement("pre");
    document.getElementById("output").appendChild(elt);
    elt.innerText = arg === 0 ? "False" : "True";
    return arg;
  },
  ...mathlib,
};

document.addEventListener("DOMContentLoaded", async () => {
  const runButton = document.getElementById("run");
  const userCode = document.getElementById("user-code") as HTMLTextAreaElement;
  runButton.addEventListener("click", async () => {
    const program = userCode.value;
    const output = document.getElementById("output");
    try {
      const wat = compile(program);
      const code = document.getElementById("generated-code");
      code.textContent = wat;
      const result = await run(wat, imports);
      output.textContent = String(result);
      output.setAttribute("style", "color: black");
    } catch (e) {
      console.error(e);
      output.textContent = String(e);
      output.setAttribute("style", "color: red");
    }
  });

  userCode.value = localStorage.getItem("program");
  userCode.addEventListener("keypress", async () => {
    localStorage.setItem("program", userCode.value);
  });
});
