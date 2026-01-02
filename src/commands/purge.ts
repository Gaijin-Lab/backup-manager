import fs from "fs/promises";
import path from "path";
import { BackupConfig } from "../core/config.js";
import { garbageCollect } from "../core/gc.js";

async function safeUnlink(p: string) {
  try {
    await fs.unlink(p);
    return true;
  } catch {
    return false;
  }
}

export async function purgeTotal(cfg: BackupConfig, snapshotId: string, dryRun = false) {
  const snapFile = path.join(cfg.repoPath, "snapshots", `${snapshotId}.json`);
  const zipFile = path.join(cfg.repoPath, "archives", `${snapshotId}.zip`);
  const sevenFile = path.join(cfg.repoPath, "archives", `${snapshotId}.7z`);

  const deletedSnapshot = dryRun ? false : await safeUnlink(snapFile);
  const deletedZip = dryRun ? false : await safeUnlink(zipFile);
  const deleted7z = dryRun ? false : await safeUnlink(sevenFile);

  const gc = await garbageCollect(cfg, dryRun);

  return {
    deletedSnapshot,
    deletedZip,
    deleted7z,
    gc,
    dryRun,
  };
}
