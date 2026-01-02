import fs from "fs/promises";
import path from "path";
import { BackupConfig } from "../core/config.js";
import { blobPath } from "../core/store.js";

type SnapshotFile = {
  id: string;
  createdAt: string;
  files: Array<{
    relPath: string;
    hash: string;
    size: number;
    mtimeMs: number;
  }>;
};

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
    throw new Error("restorePath não definido no config.json");
  }

  const snapFile = path.join(cfg.repoPath, "snapshots", `${snapshotId}.json`);
  if (!(await exists(snapFile))) {
    throw new Error(`Snapshot não encontrado: ${snapFile}`);
  }

  const raw = await fs.readFile(snapFile, "utf-8");
  const snap = JSON.parse(raw) as SnapshotFile;

  const destRoot = path.resolve(cfg.restorePath);
  await fs.mkdir(destRoot, { recursive: true });

  let restored = 0;
  let skipped = 0;

  for (const f of snap.files) {
    const src = blobPath(cfg.repoPath, f.hash);
    const dest = path.join(destRoot, "files", f.relPath);

    const destDir = path.dirname(dest);
    await fs.mkdir(destDir, { recursive: true });

    const destExists = await exists(dest);
    if (destExists && !overwrite) {
      skipped++;
      continue;
    }

    await fs.copyFile(src, dest);
    restored++;
  }

  return { restored, skipped, snapshotId: snap.id, to: destRoot };
}
