import chokidar from "chokidar";
import { BackupConfig } from "./config.js";
import { runBackup } from "./snapshot.js";
import { applyRetention } from "./retention.js";

export async function startWatcher(cfg: BackupConfig) {
  console.log("👀 Watching:", cfg.sources.join(", "));
  console.log(`Debounce: ${cfg.debounceSeconds}s`);

  let timer: NodeJS.Timeout | null = null;
  let running = false;

  const trigger = async () => {
    if (running) return;
    running = true;
    try {
      const id = await runBackup(cfg);
      await applyRetention(cfg);
      console.log(`✅ Backup OK: ${id}`);
    } catch (e) {
      console.error("❌ Backup error:", e);
    } finally {
      running = false;
    }
  };

  const watcher = chokidar.watch(cfg.sources, {
    ignored: cfg.ignore,
    ignoreInitial: true,
    persistent: true,
  });

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void trigger(), cfg.debounceSeconds! * 1000);
  };

  watcher.on("add", schedule);
  watcher.on("change", schedule);
  watcher.on("unlink", schedule);
}
