import fs from "fs/promises";
import path from "path";
import chalk from "chalk";
import { BackupConfig } from "../core/config.js";

type SnapshotFile = {
  id: string;
  createdAt: string;
  type?: "full" | "incr";
  baseId?: string;
  prevId?: string;
  stats?: {
    added: number;
    modified: number;
    removed: number;
  };
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

function normalizeType(type?: "full" | "incr") {
  return type === "incr" ? "INCR" : "FULL";
}

function shortId(id?: string) {
  if (!id) return "-";
  return id.length <= 8 ? id : id.slice(0, 8);
}

function resolveBaseId(snap: SnapshotFile, index: Map<string, SnapshotFile>) {
  if (snap.type !== "incr") return null;
  if (snap.baseId) return snap.baseId;

  let current: SnapshotFile | undefined = snap;
  const visited = new Set<string>();
  while (current && current.type === "incr") {
    if (visited.has(current.id)) return null;
    visited.add(current.id);
    if (!current.prevId) return null;
    current = index.get(current.prevId);
  }

  return current?.id ?? null;
}

function resolveChainLength(snap: SnapshotFile, index: Map<string, SnapshotFile>) {
  if (snap.type !== "incr") return null;
  let length = 1;
  let current: SnapshotFile | undefined = snap;
  const visited = new Set<string>();

  while (current && current.type === "incr") {
    if (visited.has(current.id)) return null;
    visited.add(current.id);
    if (!current.prevId) return null;
    const prev = index.get(current.prevId);
    if (!prev) return null;
    length += 1;
    current = prev;
  }

  return length;
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

  const index = new Map<string, SnapshotFile>();
  for (const fileName of names.filter((n) => n.endsWith(".json"))) {
    const p = path.join(snapDir, fileName);
    try {
      const raw = await fs.readFile(p, "utf-8");
      const snap = JSON.parse(raw) as SnapshotFile;
      const id = snap.id || fileName.replace(/\.json$/, "");
      index.set(id, { ...snap, id });
    } catch {
      continue;
    }
  }

  const rows: Array<{
    id: string;
    date: string;
    type: string;
    base: string;
    chain: string;
    files: number;
    totalBytes: number;
  }> = [];

  for (const fileName of jsonFiles) {
    const id = fileName.replace(/\.json$/, "");
    const snap = index.get(id);
    if (!snap) {
      rows.push({
        id,
        date: "invalid json",
        type: "??",
        base: "-",
        chain: "-",
        files: 0,
        totalBytes: 0,
      });
      continue;
    }

    const totalBytes = snap.files?.reduce((acc, f) => acc + (f.size || 0), 0) ?? 0;
    const type = normalizeType(snap.type);
    const baseId = resolveBaseId(snap, index);
    const chainLen = resolveChainLength(snap, index);

    rows.push({
      id: snap.id || id,
      date: snap.createdAt ? new Date(snap.createdAt).toISOString() : "unknown",
      type,
      base: snap.type === "incr" ? shortId(baseId ?? undefined) : "-",
      chain: snap.type === "incr" ? String(chainLen ?? "?") : "-",
      files: snap.files?.length ?? 0,
      totalBytes,
    });
  }

  const hId = pad("ID", 22);
  const hType = pad("TYPE", 5);
  const hBase = pad("BASE", 8);
  const hChain = pad("CHAIN", 6);
  const hDate = pad("CREATED_AT", 24);
  const hFiles = pad("FILES", 7);
  const hSize = pad("TOTAL", 12);

  console.log(`${hId}  ${hType}  ${hBase}  ${hChain}  ${hDate}  ${hFiles}  ${hSize}`);
  console.log(
    `${"-".repeat(22)}  ${"-".repeat(5)}  ${"-".repeat(8)}  ${"-".repeat(
      6
    )}  ${"-".repeat(24)}  ${"-".repeat(7)}  ${"-".repeat(12)}`
  );

  for (const r of rows) {
    const id = pad(r.id, 22);
    const type = pad(r.type, 5);
    const base = pad(r.base, 8);
    const chain = pad(r.chain, 6);
    const date = pad(r.date.replace("T", " ").replace("Z", "Z"), 24);
    const files = pad(String(r.files), 7);
    const size = pad(formatBytes(r.totalBytes), 12);
    console.log(`${id}  ${type}  ${base}  ${chain}  ${date}  ${files}  ${size}`);
  }

  console.log(chalk.dim(`\nShowing ${rows.length} snapshot(s). Use --limit to change.`));
}
