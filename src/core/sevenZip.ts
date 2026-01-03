import fs from "node:fs";
import { spawn } from "node:child_process";

type RunOptions = {
  cwd?: string;
};

function maskArgs(args: string[]) {
  return args.map((a) => (a.startsWith("-p") ? "-p***" : a));
}

export function get7zBin() {
  if (process.env.SEVEN_ZIP_BIN) return process.env.SEVEN_ZIP_BIN;

  if (process.platform === "win32") {
    const p1 = "C:\\Program Files\\7-Zip\\7z.exe";
    const p2 = "C:\\Program Files (x86)\\7-Zip\\7z.exe";
    if (fs.existsSync(p1)) return p1;
    if (fs.existsSync(p2)) return p2;
    return p1;
  }

  return "7z";
}

export async function run7z(args: string[], options: RunOptions = {}) {
  const bin = get7zBin();
  return new Promise<void>((resolve, reject) => {
    const p = spawn(bin, args, { stdio: "inherit", cwd: options.cwd });

    p.on("error", (err: any) => {
      const safeArgs = maskArgs(args);
      const msg =
        err?.code === "ENOENT"
          ? `7z binary not found: ${bin} (args: ${safeArgs.join(" ")})`
          : `Failed to run 7z: ${String(err?.message ?? err)} (args: ${safeArgs.join(" ")})`;
      reject(new Error(msg));
    });

    p.on("close", (code) => {
      if (code === 0) return resolve();
      const safeArgs = maskArgs(args);
      reject(new Error(`7z exited with code ${code} (args: ${safeArgs.join(" ")})`));
    });
  });
}
