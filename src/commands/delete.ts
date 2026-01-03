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

export async function deleteBackup(cfg: BackupConfig, snapshotId: string) {
  const snapFile = path.join(cfg.repoPath, "snapshots", `${snapshotId}.json`);
  const sevenFile = path.join(cfg.repoPath, "archives", `${snapshotId}.7z`);

  const deletedSnapshot = await safeUnlink(snapFile);
  const deleted7z = await safeUnlink(sevenFile);

  return {
    deletedSnapshot,
    deleted7z,
  };
}
