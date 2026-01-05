import fs from "fs/promises";
import path from "path";
import chalk from "chalk";

export type LogLevel = "info" | "warn" | "error";
export type LogContext = Record<string, string | number | boolean | null | undefined>;
export type LogOptions = {
  level?: LogLevel;
  context?: LogContext;
  console?: boolean;
};

function formatValue(value: LogContext[string]) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    return value.includes(" ") ? JSON.stringify(value) : value;
  }
  return String(value);
}

function formatContext(context?: LogContext) {
  if (!context) return "";
  const parts = Object.entries(context)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${formatValue(value)}`);
  return parts.length ? ` | ${parts.join(" | ")}` : "";
}

function colorize(level: LogLevel, line: string) {
  if (level === "error") return chalk.red(line);
  if (level === "warn") return chalk.yellow(line);
  return chalk.cyan(line);
}

export async function logLine(
  repoPath: string | null,
  line: string,
  options: LogOptions = {}
) {
  const d = new Date();
  const level = options.level ?? "info";
  const ctx = formatContext(options.context);
  const msg = `[${d.toISOString()}] [${level.toUpperCase()}] ${line}${ctx}\n`;

  if (options.console) {
    const out = colorize(level, msg.trimEnd());
    if (level === "error") {
      console.error(out);
    } else {
      console.log(out);
    }
  }

  if (!repoPath) return;
  const day = d.toISOString().slice(0, 10);
  const logDir = path.join(repoPath, "logs");
  await fs.mkdir(logDir, { recursive: true });
  const file = path.join(logDir, `${day}.log`);
  await fs.appendFile(file, msg, "utf-8");
}
