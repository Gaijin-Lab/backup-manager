import fs from "fs/promises";
import path from "path";
import chalk from "chalk";
import { BackupConfig } from "../core/config.js";

type SnapshotFile = {
  id: string;
  createdAt: string;
  files: Array<{
    relPath: string;
    hash: string;
    size: number;
    mtimeMs: number;
  }>;
};

function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function pad(str: string, n: number) {
  return str.length >= n ? str.slice(0, n) : str + " ".repeat(n - str.length);
}

export async function listBackups(cfg: BackupConfig, limit = 20) {
  const snapDir = path.join(cfg.repoPath, "snapshots");

  let names: string[];
  try {
    names = await fs.readdir(snapDir);
  } catch {
    console.log(chalk.yellow(`No snapshots found (missing folder): ${snapDir}`));
    return;
  }

  const jsonFiles = names
    .filter((n) => n.endsWith(".json"))
    .sort((a, b) => b.localeCompare(a))
    .slice(0, Math.max(1, limit));

  if (jsonFiles.length === 0) {
    console.log(chalk.yellow(`No snapshots found in: ${snapDir}`));
    return;
  }

  const rows: Array<{
    id: string;
    date: string;
    files: number;
    totalBytes: number;
  }> = [];

  for (const fileName of jsonFiles) {
    const p = path.join(snapDir, fileName);
    try {
      const raw = await fs.readFile(p, "utf-8");
      const snap = JSON.parse(raw) as SnapshotFile;
      const totalBytes = snap.files.reduce((acc, f) => acc + (f.size || 0), 0);

      rows.push({
        id: snap.id || fileName.replace(/\.json$/, ""),
        date: snap.createdAt ? new Date(snap.createdAt).toISOString() : "unknown",
        files: snap.files?.length ?? 0,
        totalBytes,
      });
    } catch {
      rows.push({
        id: fileName.replace(/\.json$/, ""),
        date: "invalid json",
        files: 0,
        totalBytes: 0,
      });
    }
  }

  const hId = pad("ID", 22);
  const hDate = pad("CREATED_AT", 24);
  const hFiles = pad("FILES", 7);
  const hSize = pad("TOTAL", 12);

  console.log(`${hId}  ${hDate}  ${hFiles}  ${hSize}`);
  console.log(
    `${"-".repeat(22)}  ${"-".repeat(24)}  ${"-".repeat(7)}  ${"-".repeat(12)}`
  );

  for (const r of rows) {
    const id = pad(r.id, 22);
    const date = pad(r.date.replace("T", " ").replace("Z", "Z"), 24);
    const files = pad(String(r.files), 7);
    const size = pad(formatBytes(r.totalBytes), 12);
    console.log(`${id}  ${date}  ${files}  ${size}`);
  }

  console.log(chalk.dim(`\nShowing ${rows.length} snapshot(s). Use --limit to change.`));
}
