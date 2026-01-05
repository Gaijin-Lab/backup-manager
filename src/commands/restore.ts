import fs from "fs/promises";
import path from "path";
import { BackupConfig } from "../core/config.js";
import { run7z } from "../core/sevenZip.js";

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
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

  const archiveFile = path.join(cfg.repoPath, "archives", `${snapshotId}.7z`);
  let archivePath = archiveFile;
  if (!(await exists(archiveFile))) {
    if (cfg.archiveStorePath) {
      const storedFile = path.join(cfg.archiveStorePath, `${snapshotId}.7z`);
      if (await exists(storedFile)) {
        archivePath = storedFile;
      } else {
        throw new Error(
          `Archive not found in repo or archiveStorePath: ${archiveFile} | ${storedFile}`
        );
      }
    } else {
      throw new Error(`Archive not found: ${archiveFile}`);
    }
  }

  const password = process.env.BACKUP_PASSWORD;
  if (!password) {
    throw new Error("BACKUP_PASSWORD is required to restore a backup.");
  }

  const destRoot = path.resolve(cfg.restorePath);
  await fs.mkdir(destRoot, { recursive: true });

  const overwriteMode = overwrite ? "-aoa" : "-aos";
  await run7z(["x", archivePath, `-o${destRoot}`, `-p${password}`, "-y", overwriteMode]);

  return { snapshotId, to: destRoot, overwrite, archivePath };
}
