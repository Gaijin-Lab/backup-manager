import fs from "fs/promises";
import path from "path";
import { createReadStream, createWriteStream } from "fs";

export function blobPath(repoPath: string, hash: string) {
  const a = hash.slice(0, 2);
  const b = hash.slice(2, 4);
  return path.join(repoPath, "blobs", a, b, hash);
}

export async function blobExists(repoPath: string, hash: string) {
  try {
    await fs.access(blobPath(repoPath, hash));
    return true;
  } catch {
    return false;
  }
}

export async function storeBlob(repoPath: string, hash: string, fromFile: string) {
  const dest = blobPath(repoPath, hash);
  await fs.mkdir(path.dirname(dest), { recursive: true });

  // copy streaming (works for big files)
  await new Promise<void>((resolve, reject) => {
    const r = createReadStream(fromFile);
    const w = createWriteStream(dest, { flags: "wx" }); // fail if exists
    r.on("error", reject);
    w.on("error", (e) => {
      // If already exists, ignore
      if ((e as any).code === "EEXIST") resolve();
      else reject(e);
    });
    w.on("close", () => resolve());
    r.pipe(w);
  });
}
