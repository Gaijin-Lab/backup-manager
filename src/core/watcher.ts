import chokidar from "chokidar";
import chalk from "chalk";
import { BackupConfig } from "./config.js";
import { runBackup } from "./snapshot.js";
import { applyRetention } from "./retention.js";

export async function startWatcher(cfg: BackupConfig) {
  console.log(chalk.cyan(`Watching: ${cfg.sources.join(", ")}`));
  console.log(chalk.cyan(`Debounce: ${cfg.debounceSeconds}s`));

  let timer: NodeJS.Timeout | null = null;
  let running = false;

  const trigger = async () => {
    if (running) return;
    running = true;
    try {
      const id = await runBackup(cfg);
      await applyRetention(cfg);
      if (!id) {
        console.log(chalk.yellow("No changes detected. Backup skipped."));
      } else {
        console.log(chalk.green(`Backup OK: ${id}`));
      }
    } catch (e) {
      console.error(chalk.red("Backup error:"), e);
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
