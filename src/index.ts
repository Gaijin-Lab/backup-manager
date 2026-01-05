import "dotenv/config";

import { Command } from "commander";
import chalk from "chalk";
import { loadConfig } from "./core/config.js";
import { checkForChanges, runBackup } from "./core/snapshot.js";
import { startWatcher } from "./core/watcher.js";
import { applyRetention } from "./core/retention.js";
import { listBackups } from "./commands/list.js";
import { restoreBackup } from "./commands/restore.js";
import { deleteBackup } from "./commands/delete.js";
import { purgeTotal } from "./commands/purge.js";

const program = new Command();

program
  .name("smart-backup")
  .description("Incremental backup manager (Windows/Linux) - TypeScript")
  .option("-c, --config <path>", "config path", "config.json");

program
  .command("run")
  .description("Run a backup now")
  .action(async () => {
    const opts = program.opts();
    const cfg = await loadConfig(opts.config);
    const snapId = await runBackup(cfg);
    await applyRetention(cfg);

    if (!snapId) {
      console.log(chalk.yellow("No changes detected. Backup skipped."));
      return;
    }

    console.log(chalk.green(`Backup OK: ${snapId}`));
  });

program
  .command("watch")
  .description("Watch folders and run backups when changes happen")
  .action(async () => {
    const opts = program.opts();
    const cfg = await loadConfig(opts.config);
    await startWatcher(cfg);
  });

program
  .command("check")
  .description("Check for changes since the last snapshot")
  .action(async () => {
    const opts = program.opts();
    const cfg = await loadConfig(opts.config);
    const res = await checkForChanges(cfg);

    if (res.reason === "no-files") {
      console.log(chalk.yellow("No files found. Check skipped."));
      return;
    }

    if (!res.changed) {
      console.log(chalk.yellow("No changes detected."));
      return;
    }

    if (res.reason === "no-previous") {
      console.log(chalk.yellow("No previous snapshot found. A backup would be created."));
    }

    console.log(chalk.green("Changes detected."));
    console.log(`- Added: ${res.added}`);
    console.log(`- Modified: ${res.modified}`);
    console.log(`- Removed: ${res.removed}`);

    const printList = (label: string, items: string[]) => {
      console.log(chalk.cyan(label));
      if (items.length === 0) {
        console.log(chalk.dim("  (none)"));
        return;
      }
      for (const item of items) {
        console.log(`  - ${item}`);
      }
    };

    printList("Added files:", res.addedFiles);
    printList("Modified files:", res.modifiedFiles);
    printList("Removed files:", res.removedFiles);
  });

program
  .command("list")
  .description("List snapshots")
  .option("--limit <n>", "how many snapshots to show (default 20)", "20")
  .action(async (options) => {
    const opts = program.opts();
    const cfg = await loadConfig(opts.config);
    const limit = Number(options.limit) || 20;
    await listBackups(cfg, limit);
  });

program
  .command("restore")
  .description("Restore a snapshot to the configured restorePath")
  .requiredOption("--id <snapshotId>", "snapshot id (filename without .json)")
  .option("--overwrite", "overwrite existing files", false)
  .action(async (options) => {
    const opts = program.opts();
    const cfg = await loadConfig(opts.config);

    const res = await restoreBackup(cfg, options.id, Boolean(options.overwrite));

    console.log(chalk.green("Restore OK"));
    console.log(`- Snapshot: ${res.snapshotId}`);
    console.log(`- To: ${res.to}`);
    console.log(`- Overwrite: ${res.overwrite ? "yes" : "no"}`);
  });

program
  .command("delete")
  .description("Delete a snapshot and its archive")
  .requiredOption("--id <snapshotId>", "snapshot id (filename without .json)")
  .option("--yes", "confirm deletion", false)
  .action(async (options) => {
    if (!options.yes) {
      console.log(chalk.yellow("Confirmation required. Use: delete --id <ID> --yes"));
      process.exitCode = 2;
      return;
    }

    const opts = program.opts();
    const cfg = await loadConfig(opts.config);

    const res = await deleteBackup(cfg, options.id);
    console.log(chalk.green("Delete finished"));
    console.log(`- snapshot.json: ${res.deletedSnapshot ? "deleted" : "not found"}`);
    console.log(`- archive.7z:    ${res.deleted7z ? "deleted" : "not found"}`);
  });

program
  .command("purge")
  .description("Purge a snapshot and archive (IRREVERSIBLE)")
  .requiredOption("--id <snapshotId>", "snapshot id")
  .option("--dry-run", "show what would be removed, but do nothing", false)
  .option("--yes", "confirm purge", false)
  .action(async (options) => {
    if (!options.yes) {
      console.log(chalk.yellow("Confirmation required. Use: purge --id <ID> --yes"));
      process.exitCode = 2;
      return;
    }

    const opts = program.opts();
    const cfg = await loadConfig(opts.config);

    const res = await purgeTotal(cfg, options.id, Boolean(options.dryRun));

    const suffix = res.dryRun ? " (dry-run)" : "";
    console.log(chalk.green(`Purge${suffix}`));
    console.log(`- snapshot.json: ${res.deletedSnapshot ? "deleted" : "not found"}`);
    console.log(`- archive.7z:    ${res.deleted7z ? "deleted" : "not found"}`);
  });

const knownCommands = new Set([
  "run",
  "watch",
  "check",
  "list",
  "restore",
  "delete",
  "purge",
]);

const argv = process.argv.slice(2);
const hasCommand = argv.some((arg) => knownCommands.has(arg));
const hasHelpFlag = argv.some((arg) => arg === "-h" || arg === "--help");
const hasVersionFlag = argv.some((arg) => arg === "-V" || arg === "--version");

if (!hasCommand && !hasHelpFlag && !hasVersionFlag) {
  argv.push("run");
}

await program.parseAsync(["node", "index.ts", ...argv]);
