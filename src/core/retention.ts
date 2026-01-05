import fs from "fs/promises";
import path from "path";
import { BackupConfig } from "./config.js";
import { logLine } from "./logger.js";
import { loadSnapshotById, Snapshot } from "./snapshot.js";

async function safeUnlink(p: string) {
  try {
    await fs.unlink(p);
    return true;
  } catch {
    return false;
  }
}

export async function applyRetention(cfg: BackupConfig) {
  const snapDir = path.join(cfg.repoPath, "snapshots");
  const files = await fs.readdir(snapDir).catch(() => []);
  const now = Date.now();
  const maxAgeMs = cfg.retentionDays * 24 * 60 * 60 * 1000;

  const snapshots = new Map<
    string,
    { snap: Snapshot; filePath: string; createdAtMs: number }
  >();

  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    const p = path.join(snapDir, f);
    const id = f.replace(/\.json$/, "");
    const snap = await loadSnapshotById(cfg.repoPath, id);
    if (!snap) continue;
    const st = await fs.stat(p);
    const createdAtMs = Number.isNaN(Date.parse(snap.createdAt))
      ? st.mtimeMs
      : Date.parse(snap.createdAt);
    snapshots.set(id, { snap, filePath: p, createdAtMs });
  }

  const keep = new Set<string>();
  for (const [id, entry] of snapshots) {
    if (now - entry.createdAtMs <= maxAgeMs) {
      keep.add(id);
    }
  }

  const keepWithDeps = new Set<string>(keep);
  const addDeps = (snap: Snapshot) => {
    let current: Snapshot | undefined = snap;
    const visited = new Set<string>();

    while (current) {
      if (visited.has(current.id)) break;
      visited.add(current.id);

      if (current.baseId && snapshots.has(current.baseId)) {
        keepWithDeps.add(current.baseId);
      }

      if (current.prevId && snapshots.has(current.prevId)) {
        keepWithDeps.add(current.prevId);
        current = snapshots.get(current.prevId)?.snap;
        continue;
      }

      break;
    }
  };

  for (const id of keep) {
    const entry = snapshots.get(id);
    if (entry) addDeps(entry.snap);
  }

  for (const [id, entry] of snapshots) {
    if (keepWithDeps.has(id)) continue;
    await fs.unlink(entry.filePath);
    await logLine(cfg.repoPath, `Retention: deleted snapshot ${id}.json`);

    const archivePath = path.join(cfg.repoPath, "archives", `${id}.7z`);
    const deletedRepo = await safeUnlink(archivePath);
    if (deletedRepo) {
      await logLine(cfg.repoPath, `Retention: deleted archive ${id}.7z`);
    }

    if (cfg.archiveStorePath) {
      const storePath = path.join(cfg.archiveStorePath, `${id}.7z`);
      const deletedStore = await safeUnlink(storePath);
      if (deletedStore) {
        await logLine(cfg.repoPath, `Retention: deleted stored archive ${id}.7z`);
      }
    }
  }
}
