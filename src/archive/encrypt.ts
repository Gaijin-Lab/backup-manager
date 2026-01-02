import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";

type RunOpts = {
  cwd?: string;
};

function run(cmd: string, args: string[], opts: RunOpts = {}) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, {
      stdio: "inherit",
      cwd: opts.cwd,
    });

    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

async function ensureParentDir(filePath: string) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Cria um .7z protegido por senha.
 * -mhe=on criptografa também os nomes/estrutura (header encryption).
 */
export async function create7zArchive(
  inputPath: string,
  output7z: string,
  password: string,
  opts: RunOpts = {}
) {
  if (!password) throw new Error("Missing password");
  await ensureParentDir(output7z);

  // 7z a -t7z out.7z <input> -pPASS -mhe=on -mx=9
  const args = [
    "a",
    "-t7z",
    output7z,
    inputPath,
    `-p${password}`,
    "-mhe=on",
    "-mx=9",
  ];

  await run("7z", args, opts);
}

/**
 * Testa integridade do arquivo .7z sem extrair.
 */
export async function test7zArchive(
  archive7z: string,
  password: string,
  opts: RunOpts = {}
) {
  if (!password) throw new Error("Missing password");

  // 7z t file.7z -pPASS
  const args = ["t", archive7z, `-p${password}`];
  await run("7z", args, opts);
}

/**
 * Extrai um .7z protegido por senha.
 */
export async function extract7zArchive(
  archive7z: string,
  outputDir: string,
  password: string,
  opts: RunOpts = {}
) {
  if (!password) throw new Error("Missing password");
  await fs.mkdir(outputDir, { recursive: true });

  // 7z x file.7z -pPASS -o<dir> -y
  const args = ["x", archive7z, `-p${password}`, `-o${outputDir}`, "-y"];
  await run("7z", args, opts);
}
