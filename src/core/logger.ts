import fs from "fs/promises";
import path from "path";

export async function logLine(repoPath: string, line: string) {
  const d = new Date();
  const day = d.toISOString().slice(0, 10);
  const logDir = path.join(repoPath, "logs");
  await fs.mkdir(logDir, { recursive: true });
  const file = path.join(logDir, `${day}.log`);
  const msg = `[${d.toISOString()}] ${line}\n`;
  await fs.appendFile(file, msg, "utf-8");
}
