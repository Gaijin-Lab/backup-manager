import fs from "fs/promises";
import path from "path";
import { BackupConfig } from "../core/config.js";

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function moveFile(src: string, dest: string) {
  try {
    await fs.rename(src, dest);
  } catch (err: any) {
    if (err?.code !== "EXDEV") {
      throw err;
    }
    await fs.copyFile(src, dest);
    await fs.unlink(src);
  }
}

export async function deleteBackup(cfg: BackupConfig, snapshotId: string) {
  const archivesDir = path.join(cfg.repoPath, "archives");
  const sevenFile = path.join(archivesDir, `${snapshotId}.7z`);
  const storeDir = cfg.archiveStorePath;

  if (!storeDir) {
    throw new Error("archiveStorePath is not set in config.json");
  }

  if (!(await exists(sevenFile))) {
    return { movedArchive: false, storedPath: null };
  }

  await fs.mkdir(storeDir, { recursive: true });
  const base = path.basename(sevenFile);
  let storedPath = path.join(storeDir, base);
  if (await exists(storedPath)) {
    const parsed = path.parse(base);
    storedPath = path.join(storeDir, `${parsed.name}.${Date.now()}${parsed.ext}`);
  }

  await moveFile(sevenFile, storedPath);

  return {
    movedArchive: true,
    storedPath,
  };
}
