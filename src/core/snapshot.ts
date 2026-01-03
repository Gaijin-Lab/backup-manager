import fs from "fs/promises";
import path from "path";
import { BackupConfig } from "./config.js";
import { scanSources } from "./scanner.js";
import type { FileEntry } from "./scanner.js";
import { sha256File } from "./hasher.js";
import { logLine } from "./logger.js";
import { createArchive } from "../archive/zipper.js";

export type Snapshot = {
  id: string;
  createdAt: string;
  files: Array<{
    relPath: string;
    hash: string;
    size: number;
    mtimeMs: number;
  }>;
};

export type CheckResult = {
  changed: boolean;
  added: number;
  removed: number;
  modified: number;
  total: number;
  previousTotal: number;
  addedFiles: string[];
  removedFiles: string[];
  modifiedFiles: string[];
  reason?: "no-previous" | "no-files";
};

export async function runBackup(cfg: BackupConfig): Promise<string | null> {
  await ensureRepo(cfg.repoPath);

  const { snapshot: snap, entries } = await buildSnapshot(cfg);

  if (entries.length === 0) {
    await logLine(cfg.repoPath, "No files found. Backup skipped.");
    return null;
  }

  const prev = await loadLatestSnapshot(cfg.repoPath);
  const diff = diffSnapshots(prev, snap);

  if (!diff.changed) {
    await logLine(cfg.repoPath, "No changes detected. Backup skipped.");
    return null;
  }

  if (!process.env.BACKUP_PASSWORD) {
    throw new Error("BACKUP_PASSWORD is required to create a backup.");
  }

  await logLine(cfg.repoPath, `Backup started: ${snap.id}`);

  const snapDir = path.join(cfg.repoPath, "snapshots");
  await fs.mkdir(snapDir, { recursive: true });

  const snapFile = path.join(snapDir, `${snap.id}.json`);
  await fs.writeFile(snapFile, JSON.stringify(snap, null, 2), "utf-8");

  await logLine(cfg.repoPath, `Snapshot saved: ${snapFile}`);

  await createArchive(cfg, snap, entries);

  await logLine(cfg.repoPath, `Backup finished: ${snap.id}`);
  return snap.id;
}

export async function checkForChanges(cfg: BackupConfig): Promise<CheckResult> {
  const { snapshot, entries } = await buildSnapshot(cfg);

  if (entries.length === 0) {
    return {
      changed: false,
      added: 0,
      removed: 0,
      modified: 0,
      total: 0,
      previousTotal: 0,
      addedFiles: [],
      removedFiles: [],
      modifiedFiles: [],
      reason: "no-files",
    };
  }

  const prev = await loadLatestSnapshot(cfg.repoPath);
  return diffSnapshots(prev, snapshot);
}

async function ensureRepo(repoPath: string) {
  await fs.mkdir(repoPath, { recursive: true });
  await fs.mkdir(path.join(repoPath, "snapshots"), { recursive: true });
  await fs.mkdir(path.join(repoPath, "archives"), { recursive: true });
  await fs.mkdir(path.join(repoPath, "logs"), { recursive: true });
}

async function loadLatestSnapshot(repoPath: string): Promise<Snapshot | null> {
  const snapDir = path.join(repoPath, "snapshots");
  let names: string[] = [];

  try {
    names = await fs.readdir(snapDir);
  } catch {
    return null;
  }

  const jsonFiles = names
    .filter((n) => n.endsWith(".json"))
    .sort((a, b) => b.localeCompare(a));

  for (const fileName of jsonFiles) {
    const p = path.join(snapDir, fileName);
    try {
      const raw = await fs.readFile(p, "utf-8");
      return JSON.parse(raw) as Snapshot;
    } catch {
      continue;
    }
  }

  return null;
}

async function buildSnapshot(cfg: BackupConfig): Promise<{
  snapshot: Snapshot;
  entries: FileEntry[];
}> {
  const entries = await scanSources(cfg.sources, cfg.ignore!);
  entries.sort((a, b) => a.relPath.localeCompare(b.relPath));

  const now = new Date();
  const createdAt = now.toISOString();
  const id = toBackupId(now);

  const files: Snapshot["files"] = [];

  for (const entry of entries) {
    const st = await fs.stat(entry.absPath);
    const hash = await sha256File(entry.absPath);

    files.push({
      relPath: entry.relPath,
      hash,
      size: st.size,
      mtimeMs: st.mtimeMs,
    });
  }

  return { snapshot: { id, createdAt, files }, entries };
}

function diffSnapshots(prev: Snapshot | null, next: Snapshot): CheckResult {
  if (!prev) {
    return {
      changed: next.files.length > 0,
      added: next.files.length,
      removed: 0,
      modified: 0,
      total: next.files.length,
      previousTotal: 0,
      addedFiles: next.files.map((f) => f.relPath),
      removedFiles: [],
      modifiedFiles: [],
      reason: "no-previous",
    };
  }

  const prevMap = new Map(prev.files.map((f) => [f.relPath, f]));
  const nextMap = new Map(next.files.map((f) => [f.relPath, f]));

  const addedFiles: string[] = [];
  const removedFiles: string[] = [];
  const modifiedFiles: string[] = [];

  for (const [relPath, f] of nextMap) {
    const pf = prevMap.get(relPath);
    if (!pf) {
      addedFiles.push(relPath);
      continue;
    }

    if (pf.hash !== f.hash || pf.size !== f.size) {
      modifiedFiles.push(relPath);
    }
  }

  for (const relPath of prevMap.keys()) {
    if (!nextMap.has(relPath)) {
      removedFiles.push(relPath);
    }
  }

  addedFiles.sort();
  removedFiles.sort();
  modifiedFiles.sort();

  return {
    changed: addedFiles.length + removedFiles.length + modifiedFiles.length > 0,
    added: addedFiles.length,
    removed: removedFiles.length,
    modified: modifiedFiles.length,
    total: next.files.length,
    previousTotal: prev.files.length,
    addedFiles,
    removedFiles,
    modifiedFiles,
  };
}

function toBackupId(d: Date) {
  const iso = d.toISOString();
  const date = iso.slice(0, 10).replace(/-/g, "");
  const time = iso.slice(11, 19).replace(/:/g, "");
  return `${date}_${time}`;
}
