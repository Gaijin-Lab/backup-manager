import fs from "fs/promises";
import path from "path";

export type BackupConfig = {
  repoPath: string;
  sources: string[];
  restorePath?: string;
  ignore?: string[];
  retentionDays: number; // ex: 7, 15, 30
  debounceSeconds?: number; // watch mode
  archive?: {
    enabled: boolean;
    encrypt?: boolean;      // se true e format=7z, usa senha do .env
    format?: "zip" | "7z";  // default: encrypt ? "7z" : "zip"
  };

};

export async function loadConfig(configPath: string): Promise<BackupConfig> {
  const raw = await fs.readFile(configPath, "utf-8");
  const cfg = JSON.parse(raw) as BackupConfig;

  if (!cfg.repoPath || !cfg.sources?.length) {
    throw new Error("Invalid config: repoPath and sources are required.");
  }

  cfg.repoPath = path.resolve(cfg.repoPath);
  cfg.sources = cfg.sources.map((p) => path.resolve(p));

  if (cfg.restorePath) {
    cfg.restorePath = path.resolve(cfg.restorePath);
  }

  cfg.ignore ??= ["**/.git/**", "**/node_modules/**", "**/.cache/**"];
  cfg.debounceSeconds ??= 10;
  cfg.archive ??= { enabled: true, encrypt: false };
  cfg.archive.format ??= (cfg.archive.encrypt ? "7z" : "zip");

  return cfg;
}
