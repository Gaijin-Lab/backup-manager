import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import archiver from "archiver";
import { spawn } from "node:child_process";

import { BackupConfig } from "../core/config.js";
import { Snapshot } from "../core/snapshot.js";
import { blobPath } from "../core/store.js";
import { logLine } from "../core/logger.js";

function get7zBin() {
  // permite você forçar no .env:
  // SEVEN_ZIP_BIN="C:\Program Files\7-Zip\7z.exe"
  if (process.env.SEVEN_ZIP_BIN) return process.env.SEVEN_ZIP_BIN;

  // Windows: tenta caminhos comuns
  if (process.platform === "win32") {
    const p1 = "C:\\Program Files\\7-Zip\\7z.exe";
    const p2 = "C:\\Program Files (x86)\\7-Zip\\7z.exe";
    // não checamos fs.existsSync pra evitar import extra; o spawn vai falhar se não existir
    return p1;
  }

  // Linux/mac (p7zip-full geralmente instala "7z" no PATH)
  return "7z";
}

function run(cmd: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit" });

    p.on("error", (err: any) => {
      // mascara senha se ela estiver nos args
      const safeArgs = args.map((a) => (a.startsWith("-p") ? "-p***" : a));
      const msg =
        err?.code === "ENOENT"
          ? `Não encontrei o executável: ${cmd} (args: ${safeArgs.join(" ")})`
          : `Falha ao executar ${cmd}: ${String(err?.message ?? err)} (args: ${safeArgs.join(" ")})`;
      reject(new Error(msg));
    });

    p.on("close", (code) => {
      if (code === 0) return resolve();
      const safeArgs = args.map((a) => (a.startsWith("-p") ? "-p***" : a));
      reject(new Error(`${cmd} exited with code ${code} (args: ${safeArgs.join(" ")})`));
    });
  });
}

export async function createArchive(cfg: BackupConfig, snap: Snapshot) {
  const outDir = path.join(cfg.repoPath, "archives");
  await fsp.mkdir(outDir, { recursive: true });

  const zipPath = path.join(outDir, `${snap.id}.zip`);
  await logLine(cfg.repoPath, `Archive start: ${zipPath}`);

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve());
    archive.on("error", (err: Error) => reject(err));

    archive.pipe(output);

    archive.append(JSON.stringify(snap, null, 2), { name: "snapshot.json" });

    for (const f of snap.files) {
      const p = blobPath(cfg.repoPath, f.hash);
      archive.file(p, { name: `files/${f.relPath}` });
    }

    archive.finalize();
  });

  await logLine(cfg.repoPath, `Archive done: ${zipPath}`);

  if (!cfg.archive?.encrypt) return;

  const password = process.env.BACKUP_PASSWORD;
  if (!password) {
    await logLine(cfg.repoPath, "Encryption skipped: BACKUP_PASSWORD not set");
    return;
  }

  const sevenPath = path.join(outDir, `${snap.id}.7z`);

  await run(get7zBin(), [
    "a",
    "-t7z",
    sevenPath,
    zipPath,
    `-p${password}`,
    "-mhe=on",
    "-mx=9",
  ]);

  await fsp.unlink(zipPath);
  await logLine(cfg.repoPath, `Archive encrypted (7z): ${sevenPath}`);
}
