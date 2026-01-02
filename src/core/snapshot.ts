import fs from "fs/promises";
import path from "path";
import { BackupConfig } from "./config.js";
import { scanSources } from "./scanner.js";
import { sha256File } from "./hasher.js";
import { blobExists, storeBlob } from "./store.js";
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

export async function runBackup(cfg: BackupConfig): Promise<string> {
  await ensureRepo(cfg.repoPath);

  const now = new Date();
  const createdAt = now.toISOString();
  const id = toBackupId(now);

  await logLine(cfg.repoPath, `Backup started: ${id}`);

  const entries = await scanSources(cfg.sources, cfg.ignore!);
  const snap: Snapshot = { id, createdAt, files: [] };

  for (const f of entries) {
    const st = await fs.stat(f.absPath);
    const hash = await sha256File(f.absPath);

    if (!(await blobExists(cfg.repoPath, hash))) {
      await storeBlob(cfg.repoPath, hash, f.absPath);
      await logLine(cfg.repoPath, `Stored blob: ${hash} (${f.relPath})`);
    }

    snap.files.push({
      relPath: f.relPath,
      hash,
      size: st.size,
      mtimeMs: st.mtimeMs,
    });
  }

  const snapDir = path.join(cfg.repoPath, "snapshots");
  await fs.mkdir(snapDir, { recursive: true });

  const snapFile = path.join(snapDir, `${id}.json`);
  await fs.writeFile(snapFile, JSON.stringify(snap, null, 2), "utf-8");

  await logLine(cfg.repoPath, `Snapshot saved: ${snapFile}`);

  if (cfg.archive?.enabled) {
    await createArchive(cfg, snap);
  }

  await logLine(cfg.repoPath, `Backup finished: ${id}`);
  return id;
}

async function ensureRepo(repoPath: string) {
  await fs.mkdir(repoPath, { recursive: true });
  await fs.mkdir(path.join(repoPath, "snapshots"), { recursive: true });
  await fs.mkdir(path.join(repoPath, "blobs"), { recursive: true });
  await fs.mkdir(path.join(repoPath, "archives"), { recursive: true });
  await fs.mkdir(path.join(repoPath, "logs"), { recursive: true });
}

function toBackupId(d: Date) {
  // Example: 20260102_070850 (UTC)
  const iso = d.toISOString();
  const date = iso.slice(0, 10).replace(/-/g, "");
  const time = iso.slice(11, 19).replace(/:/g, "");
  return `${date}_${time}`;
}
