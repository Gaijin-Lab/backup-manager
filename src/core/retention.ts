import fs from "fs/promises";
import path from "path";
import { BackupConfig } from "./config.js";
import { logLine } from "./logger.js";

export async function applyRetention(cfg: BackupConfig) {
  const snapDir = path.join(cfg.repoPath, "snapshots");
  const files = await fs.readdir(snapDir);
  const now = Date.now();
  const maxAgeMs = cfg.retentionDays * 24 * 60 * 60 * 1000;

  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    const p = path.join(snapDir, f);
    const st = await fs.stat(p);
    if (now - st.mtimeMs > maxAgeMs) {
      await fs.unlink(p);
      await logLine(cfg.repoPath, `Retention: deleted snapshot ${f}`);
    }
  }

  // (Opcional futuro) GC de blobs não referenciados por nenhum snapshot.
}
