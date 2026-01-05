import fs from "fs/promises";
import path from "path";
import { BackupConfig } from "../core/config.js";
import { logLine } from "../core/logger.js";
import { sha256File } from "../core/hasher.js";
import { loadSnapshotById, Snapshot } from "../core/snapshot.js";
import { run7z } from "../core/sevenZip.js";

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function toNativePath(p: string) {
  return p.split("/").join(path.sep);
}

function archiveLocations(cfg: BackupConfig, snapshotId: string) {
  const repoArchive = path.join(cfg.repoPath, "archives", `${snapshotId}.7z`);
  const storeArchive = cfg.archiveStorePath
    ? path.join(cfg.archiveStorePath, `${snapshotId}.7z`)
    : null;
  return { repoArchive, storeArchive };
}

async function findArchivePath(cfg: BackupConfig, snapshotId: string) {
  const { repoArchive, storeArchive } = archiveLocations(cfg, snapshotId);
  if (await exists(repoArchive)) return repoArchive;
  if (storeArchive && (await exists(storeArchive))) return storeArchive;
  return null;
}

async function buildRestoreChain(
  repoPath: string,
  target: Snapshot
): Promise<Snapshot[]> {
  if (target.type !== "incr") {
    return [target];
  }

  const chain: Snapshot[] = [];
  const visited = new Set<string>();
  let current: Snapshot | null = target;

  while (current) {
    if (visited.has(current.id)) {
      throw new Error(`Chain broken: loop detected at ${current.id}`);
    }
    visited.add(current.id);
    chain.push(current);

    if (current.type !== "incr") break;
    if (!current.prevId) {
      throw new Error(`Chain broken: missing prevId for ${current.id}`);
    }

    const prev = await loadSnapshotById(repoPath, current.prevId);
    if (!prev) {
      throw new Error(`Chain broken: missing snapshot ${current.prevId}`);
    }
    current = prev;
  }

  const base = chain[chain.length - 1];
  if (base.type === "incr") {
    throw new Error("Chain broken: base full not found");
  }
  if (target.baseId && base.id !== target.baseId) {
    throw new Error(`Chain broken: baseId mismatch (${target.baseId})`);
  }

  return chain.reverse();
}

async function applyRemovedFiles(destRoot: string, removedFiles: string[]) {
  for (const relPath of removedFiles) {
    const target = path.join(destRoot, toNativePath(relPath));
    await fs.rm(target, { force: true, recursive: true }).catch(() => {});
  }
}

async function verifyRestore(
  cfg: BackupConfig,
  target: Snapshot,
  destRoot: string
) {
  const files = target.files ?? [];
  if (files.length === 0) return;

  const sampleSize = Math.min(10, files.length);
  const sample = files.slice(0, sampleSize);
  const mismatches: string[] = [];

  for (const file of sample) {
    const p = path.join(destRoot, toNativePath(file.relPath));
    try {
      const hash = await sha256File(p);
      if (hash !== file.hash) {
        mismatches.push(file.relPath);
      }
    } catch {
      mismatches.push(file.relPath);
    }
  }

  if (mismatches.length > 0) {
    await logLine(cfg.repoPath, "Restore verify mismatches", {
      level: "warn",
      context: { snapshotId: target.id, sampleSize, mismatches: mismatches.length },
    });
  } else {
    await logLine(cfg.repoPath, "Restore verify OK", {
      level: "info",
      context: { snapshotId: target.id, sampleSize },
    });
  }
}

export async function restoreBackup(
  cfg: BackupConfig,
  snapshotId: string,
  overwrite = false
) {
  if (!cfg.restorePath) {
    throw new Error("restorePath is not set in config.json");
  }

  const target = await loadSnapshotById(cfg.repoPath, snapshotId);
  if (!target) {
    throw new Error(`Snapshot not found: ${snapshotId}`);
  }

  const password = process.env.BACKUP_PASSWORD;
  if (!password) {
    throw new Error("BACKUP_PASSWORD is required to restore a backup.");
  }

  const destRoot = path.resolve(cfg.restorePath);
  await fs.mkdir(destRoot, { recursive: true });

  const archivePaths: string[] = [];
  const overwriteMode = overwrite ? "-aoa" : "-aos";

  if (target.type !== "incr") {
    const archivePath = await findArchivePath(cfg, snapshotId);
    if (!archivePath) {
      const { repoArchive, storeArchive } = archiveLocations(cfg, snapshotId);
      if (storeArchive) {
        throw new Error(
          `Archive not found in repo or archiveStorePath: ${repoArchive} | ${storeArchive}`
        );
      }
      throw new Error(`Archive not found: ${repoArchive}`);
    }

    await run7z([
      "x",
      archivePath,
      `-o${destRoot}`,
      `-p${password}`,
      "-y",
      overwriteMode,
    ]);
    archivePaths.push(archivePath);
  } else {
    const chain = await buildRestoreChain(cfg.repoPath, target);
    const base = chain[0];

    const baseArchive = await findArchivePath(cfg, base.id);
    if (!baseArchive) {
      throw new Error(`Chain broken: missing archive for ${base.id}`);
    }

    const baseOverwriteMode = "-aoa";
    await run7z([
      "x",
      baseArchive,
      `-o${destRoot}`,
      `-p${password}`,
      "-y",
      baseOverwriteMode,
    ]);
    archivePaths.push(baseArchive);

    for (const snap of chain.slice(1)) {
      const hasStats = Boolean(snap.stats);
      const added = snap.stats?.added ?? 0;
      const modified = snap.stats?.modified ?? 0;
      const shouldExtract = hasStats ? added + modified > 0 : true;
      const archivePath = await findArchivePath(cfg, snap.id);

      if (!archivePath) {
        if (shouldExtract) {
          throw new Error(`Chain broken: missing archive for ${snap.id}`);
        }
      } else {
        await run7z([
          "x",
          archivePath,
          `-o${destRoot}`,
          `-p${password}`,
          "-y",
          "-aoa",
        ]);
        archivePaths.push(archivePath);
      }

      if (snap.removedFiles?.length) {
        await applyRemovedFiles(destRoot, snap.removedFiles);
      }
    }
  }

  if (cfg.restoreVerify) {
    await verifyRestore(cfg, target, destRoot);
  }

  return { snapshotId, to: destRoot, overwrite, archivePaths };
}
