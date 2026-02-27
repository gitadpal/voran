import vm from "node:vm";

const DEFAULT_TIMEOUT_MS = 5000;

const SAFE_GLOBALS: Record<string, unknown> = {
  JSON,
  Math,
  String,
  Number,
  Array,
  Object,
  RegExp,
  Date,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  encodeURIComponent,
  decodeURIComponent,
  undefined,
  NaN,
  Infinity,
};

export function executeScript(rawResponse: string, code: string, timeout?: number): string {
  const sandbox: Record<string, unknown> = { ...SAFE_GLOBALS };

  const context = vm.createContext(sandbox);

  // Run the user code to define the extract function
  try {
    vm.runInContext(code, context, {
      timeout: timeout ?? DEFAULT_TIMEOUT_MS,
      filename: "extraction-script.js",
    });
  } catch (e) {
    if ((e as Error).constructor?.name === "ERR_SCRIPT_EXECUTION_TIMEOUT" || (e as Error).message?.includes("timed out")) {
      throw new Error("Script execution timed out");
    }
    throw new Error(`Script compilation/execution error: ${(e as Error).message}`);
  }

  if (typeof sandbox.extract !== "function") {
    throw new Error("Script must define an extract() function");
  }

  // Call extract(rawResponse)
  let result: unknown;
  try {
    result = vm.runInContext(`extract(${JSON.stringify(rawResponse)})`, context, {
      timeout: timeout ?? DEFAULT_TIMEOUT_MS,
      filename: "extraction-call.js",
    });
  } catch (e) {
    if ((e as Error).message?.includes("timed out")) {
      throw new Error("Script execution timed out");
    }
    throw new Error(`extract() threw an error: ${(e as Error).message}`);
  }

  if (typeof result === "undefined" || result === null) {
    throw new Error("extract() must return a string, got " + String(result));
  }

  if (typeof result === "object") {
    return JSON.stringify(result);
  }

  return String(result);
}
