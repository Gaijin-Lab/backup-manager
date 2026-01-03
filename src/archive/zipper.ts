import fs from "fs/promises";
import path from "path";

import { BackupConfig } from "../core/config.js";
import { Snapshot } from "../core/snapshot.js";
import { FileEntry } from "../core/scanner.js";
import { logLine } from "../core/logger.js";
import { run7z } from "../core/sevenZip.js";

function toNativePath(p: string) {
  return p.split("/").join(path.sep);
}

function quotePath(p: string) {
  const escaped = p.replace(/\"/g, "\\\"");
  return `"${escaped}"`;
}

export async function createArchive(
  cfg: BackupConfig,
  snap: Snapshot,
  entries: FileEntry[]
) {
  if (!entries.length) {
    throw new Error("No files found to archive.");
  }

  const password = process.env.BACKUP_PASSWORD;
  if (!password) {
    throw new Error("BACKUP_PASSWORD is required to create a 7z backup.");
  }

  const outDir = path.join(cfg.repoPath, "archives");
  await fs.mkdir(outDir, { recursive: true });

  const archivePath = path.join(outDir, `${snap.id}.7z`);
  await logLine(cfg.repoPath, `Archive start: ${archivePath}`);

  const tmpDir = path.join(cfg.repoPath, ".tmp");
  await fs.mkdir(tmpDir, { recursive: true });

  const groups = new Map<string, string[]>();
  for (const entry of entries) {
    const relNative = toNativePath(entry.relPath);
    const list = groups.get(entry.sourceParent) ?? [];
    list.push(relNative);
    groups.set(entry.sourceParent, list);
  }

  let idx = 0;
  const listFiles: string[] = [];

  try {
    for (const [parent, rels] of groups) {
      const listPath = path.join(tmpDir, `${snap.id}-${idx}.list`);
      listFiles.push(listPath);
      idx += 1;

      const payload = rels.sort().map(quotePath).join("\n");
      await fs.writeFile(listPath, payload, "utf-8");

      await run7z(
        [
          "a",
          "-t7z",
          archivePath,
          `-p${password}`,
          "-mhe=on",
          "-mx=9",
          "-y",
          `@${listPath}`,
        ],
        { cwd: parent }
      );
    }
  } finally {
    for (const listPath of listFiles) {
      await fs.unlink(listPath).catch(() => {});
    }
  }

  await logLine(cfg.repoPath, `Archive done: ${archivePath}`);
}
