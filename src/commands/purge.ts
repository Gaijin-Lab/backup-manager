import fs from "fs/promises";
import path from "path";
import { BackupConfig } from "../core/config.js";

async function safeUnlink(p: string) {
  try {
    await fs.unlink(p);
    return true;
  } catch {
    return false;
  }
}

export async function purgeTotal(
  cfg: BackupConfig,
  snapshotId: string,
  dryRun = false
) {
  const snapFile = path.join(cfg.repoPath, "snapshots", `${snapshotId}.json`);
  const archivesDir = path.join(cfg.repoPath, "archives");
  const sevenFile = path.join(archivesDir, `${snapshotId}.7z`);
  const storeFile = cfg.archiveStorePath
    ? path.join(cfg.archiveStorePath, `${snapshotId}.7z`)
    : null;

  const deletedSnapshot = dryRun ? false : await safeUnlink(snapFile);
  const deletedArchive = dryRun ? false : await safeUnlink(sevenFile);
  const deletedStore = storeFile ? (dryRun ? false : await safeUnlink(storeFile)) : false;
  const deleted7z = deletedArchive || deletedStore;

  return {
    deletedSnapshot,
    deleted7z,
    deletedStore,
    dryRun,
  };
}
