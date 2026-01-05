import fs from "fs/promises";
import path from "path";
import { BackupConfig } from "./config.js";
import { scanSources } from "./scanner.js";
import type { FileEntry } from "./scanner.js";
import { sha256File } from "./hasher.js";
import { logLine } from "./logger.js";
import { createArchive } from "../archive/zipper.js";

export type SnapshotType = "full" | "incr";
export type SnapshotStats = {
  added: number;
  modified: number;
  removed: number;
};

export type Snapshot = {
  id: string;
  createdAt: string;
  type?: SnapshotType;
  baseId?: string;
  prevId?: string;
  removedFiles?: string[];
  stats?: SnapshotStats;
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

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export function normalizeSnapshot(snap: Snapshot): Snapshot {
  const type: SnapshotType = snap.type === "incr" ? "incr" : "full";
  return {
    ...snap,
    type,
    files: Array.isArray(snap.files) ? snap.files : [],
    removedFiles: Array.isArray(snap.removedFiles) ? snap.removedFiles : [],
  };
}

export async function loadSnapshotById(
  repoPath: string,
  id: string
): Promise<Snapshot | null> {
  const snapDir = path.join(repoPath, "snapshots");
  const p = path.join(snapDir, `${id}.json`);
  try {
    const raw = await fs.readFile(p, "utf-8");
    const snap = JSON.parse(raw) as Snapshot;
    const normalized = normalizeSnapshot({
      ...snap,
      id: snap.id || id,
    });
    return normalized;
  } catch {
    return null;
  }
}

export async function loadSnapshotsIndex(
  repoPath: string
): Promise<Map<string, Snapshot>> {
  const snapDir = path.join(repoPath, "snapshots");
  const names = await fs.readdir(snapDir).catch(() => []);
  const index = new Map<string, Snapshot>();

  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const id = name.replace(/\.json$/, "");
    const snap = await loadSnapshotById(repoPath, id);
    if (snap) {
      index.set(snap.id || id, snap);
    }
  }

  return index;
}

function parseSnapshotTime(snap: Snapshot): number | null {
  if (snap.createdAt) {
    const ts = Date.parse(snap.createdAt);
    if (!Number.isNaN(ts)) return ts;
  }

  const m = /^(\d{8})_(\d{6})$/.exec(snap.id);
  if (m) {
    const date = m[1];
    const time = m[2];
    const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(
      6,
      8
    )}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}Z`;
    const ts = Date.parse(iso);
    if (!Number.isNaN(ts)) return ts;
  }

  return null;
}

async function archiveExists(cfg: BackupConfig, snapshotId: string) {
  const repoArchive = path.join(cfg.repoPath, "archives", `${snapshotId}.7z`);
  if (await exists(repoArchive)) return true;
  if (!cfg.archiveStorePath) return false;
  const storeArchive = path.join(cfg.archiveStorePath, `${snapshotId}.7z`);
  return exists(storeArchive);
}
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

  const stats: SnapshotStats = {
    added: diff.added,
    modified: diff.modified,
    removed: diff.removed,
  };

  const chainInfo = await getChainInfo(cfg.repoPath, prev);
  const now = Date.now();
  const baseTime = chainInfo.base ? parseSnapshotTime(chainInfo.base) : null;
  const hoursSinceBase =
    baseTime !== null ? (now - baseTime) / (1000 * 60 * 60) : null;

  let createFull = false;
  if (!prev) {
    createFull = true;
  } else if (chainInfo.broken || !chainInfo.base) {
    createFull = true;
  } else if (cfg.fullEverySnapshots && chainInfo.length >= cfg.fullEverySnapshots) {
    createFull = true;
  } else if (cfg.maxChainLength && chainInfo.length >= cfg.maxChainLength) {
    createFull = true;
  } else if (
    cfg.fullEveryHours &&
    hoursSinceBase !== null &&
    hoursSinceBase >= cfg.fullEveryHours
  ) {
    createFull = true;
  } else if (!(await archiveExists(cfg, chainInfo.base.id))) {
    createFull = true;
  }

  const backupType: SnapshotType = createFull ? "full" : "incr";
  const baseId = backupType === "incr" ? chainInfo.base?.id : undefined;
  const prevId = backupType === "incr" ? prev?.id : undefined;
  const removedFiles = backupType === "incr" ? diff.removedFiles : undefined;

  const snapshotToSave: Snapshot = {
    ...snap,
    type: backupType,
    baseId,
    prevId,
    removedFiles,
    stats,
  };

  await logLine(cfg.repoPath, `Backup started: ${snap.id} (${backupType})`);

  const snapDir = path.join(cfg.repoPath, "snapshots");
  await fs.mkdir(snapDir, { recursive: true });

  const snapFile = path.join(snapDir, `${snap.id}.json`);
  await fs.writeFile(snapFile, JSON.stringify(snapshotToSave, null, 2), "utf-8");

  await logLine(cfg.repoPath, `Snapshot saved: ${snapFile}`);

  if (backupType === "full") {
    await createArchive(cfg, snap, entries, { mode: "full" });
  } else {
    const includeRel = new Set([...diff.addedFiles, ...diff.modifiedFiles]);
    const incrEntries = entries.filter((e) => includeRel.has(e.relPath));
    if (incrEntries.length === 0) {
      await logLine(cfg.repoPath, `Incremental archive skipped (removals only): ${snap.id}`);
    } else {
      await createArchive(cfg, snap, incrEntries, { mode: "incr", includeRelPaths: includeRel });
    }
  }

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
      const snap = JSON.parse(raw) as Snapshot;
      const id = snap.id || fileName.replace(/\.json$/, "");
      return normalizeSnapshot({ ...snap, id });
    } catch {
      continue;
    }
  }

  return null;
}

async function getChainInfo(repoPath: string, latest: Snapshot | null) {
  if (!latest) {
    return { base: null, length: 0, broken: false };
  }

  let length = 1;
  let current: Snapshot = latest;
  let base: Snapshot | null = latest;
  const visited = new Set<string>([latest.id]);

  while (current.type === "incr") {
    const prevId = current.prevId;
    if (!prevId) {
      return { base: null, length, broken: true };
    }
    if (visited.has(prevId)) {
      return { base: null, length, broken: true };
    }
    const prev = await loadSnapshotById(repoPath, prevId);
    if (!prev) {
      return { base: null, length, broken: true };
    }
    visited.add(prev.id);
    length += 1;
    base = prev;
    current = prev;
  }

  return { base, length, broken: false };
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
