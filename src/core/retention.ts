import fs from "fs/promises";
import path from "path";
import { BackupConfig } from "./config.js";
import { logLine } from "./logger.js";

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

  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    const p = path.join(snapDir, f);
    const st = await fs.stat(p);
    if (now - st.mtimeMs > maxAgeMs) {
      await fs.unlink(p);
      await logLine(cfg.repoPath, `Retention: deleted snapshot ${f}`);

      const id = f.replace(/\.json$/, "");
      const archivePath = path.join(cfg.repoPath, "archives", `${id}.7z`);
      const deleted = await safeUnlink(archivePath);
      if (deleted) {
        await logLine(cfg.repoPath, `Retention: deleted archive ${id}.7z`);
      }
    }
  }
}
