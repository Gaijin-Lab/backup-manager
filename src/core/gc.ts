import fs from "fs/promises";
import path from "path";
import { BackupConfig } from "./config.js";

type SnapshotFile = {
  id: string;
  createdAt: string;
  files: Array<{ relPath: string; hash: string; size: number; mtimeMs: number }>;
};

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  if (!(await exists(dir))) return out;

  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await walkFiles(full)));
    } else if (e.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function hashFromBlobPath(blobsDir: string, filePath: string) {
  // suporta estrutura tipo: blobs/ab/cdef...  -> hash = "ab" + "cdef..."
  const rel = path.relative(blobsDir, filePath);
  const parts = rel.split(path.sep);
  return parts.join("");
}

export async function garbageCollect(cfg: BackupConfig, dryRun = false) {
  const snapsDir = path.join(cfg.repoPath, "snapshots");
  const blobsDir = path.join(cfg.repoPath, "blobs");

  // 1) hashes referenciados por snapshots existentes
  const referenced = new Set<string>();

  if (await exists(snapsDir)) {
    const snaps = (await fs.readdir(snapsDir))
      .filter((n) => n.endsWith(".json"))
      .map((n) => path.join(snapsDir, n));

    for (const p of snaps) {
      try {
        const raw = await fs.readFile(p, "utf-8");
        const snap = JSON.parse(raw) as SnapshotFile;
        for (const f of snap.files || []) referenced.add(f.hash);
      } catch {
        // snapshot inválido: ignora
      }
    }
  }

  // 2) listar todos os blobs existentes
  const blobFiles = await walkFiles(blobsDir);

  let orphanCount = 0;
  let removedCount = 0;
  let bytesFreed = 0;

  for (const bf of blobFiles) {
    const hash = hashFromBlobPath(blobsDir, bf);
    if (!referenced.has(hash)) {
      orphanCount++;
      const st = await fs.stat(bf);

      if (dryRun) continue;

      await fs.unlink(bf);
      removedCount++;
      bytesFreed += st.size;
    }
  }

  // 3) limpar pastas vazias em blobs/
  if (!dryRun && (await exists(blobsDir))) {
    // remove subpastas vazias (duas camadas costuma bastar)
    const lvl1 = await fs.readdir(blobsDir).catch(() => []);
    for (const d1 of lvl1) {
      const p1 = path.join(blobsDir, d1);
      const s1 = await fs.stat(p1).catch(() => null);
      if (!s1?.isDirectory()) continue;

      const lvl2 = await fs.readdir(p1).catch(() => []);
      for (const d2 of lvl2) {
        const p2 = path.join(p1, d2);
        const s2 = await fs.stat(p2).catch(() => null);
        if (!s2?.isDirectory()) continue;

        const inside = await fs.readdir(p2).catch(() => []);
        if (inside.length === 0) await fs.rmdir(p2).catch(() => {});
      }

      const inside1 = await fs.readdir(p1).catch(() => []);
      if (inside1.length === 0) await fs.rmdir(p1).catch(() => {});
    }
  }

  return {
    snapshotsReferenced: referenced.size,
    blobsTotal: blobFiles.length,
    orphanCount,
    removedCount,
    bytesFreed,
    dryRun,
  };
}
