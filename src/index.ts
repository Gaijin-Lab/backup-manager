import "dotenv/config";

import { Command } from "commander";
import { loadConfig } from "./core/config.js";
import { runBackup } from "./core/snapshot.js";
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
    console.log(`✅ Backup OK: ${snapId}`);
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

    console.log(`✅ Restore OK`);
    console.log(`- Snapshot: ${res.snapshotId}`);
    console.log(`- To: ${cfg.restorePath}`);
    console.log(`- Restored: ${res.restored}`);
    console.log(`- Skipped: ${res.skipped} (use --overwrite to force)`);
  });
  
program
  .command("delete")
  .description("Delete a snapshot (and archive). Blobs are kept.")
  .requiredOption("--id <snapshotId>", "snapshot id (filename without .json)")
  .option("--yes", "confirm deletion", false)
  .action(async (options) => {
    if (!options.yes) {
      console.log("❌ Confirmação necessária. Use: delete --id <ID> --yes");
      process.exitCode = 2;
      return;
    }

    const opts = program.opts();
    const cfg = await loadConfig(opts.config);

    const res = await deleteBackup(cfg, options.id);
    console.log(`✅ Delete finished`);
    console.log(`- snapshot.json: ${res.deletedSnapshot ? "deleted" : "not found"}`);
    console.log(`- archive.zip:   ${res.deletedZip ? "deleted" : "not found"}`);
    console.log(`- archive.7z:    ${res.deleted7z ? "deleted" : "not found"}`);
    console.log(`- Note: ${res.note}`);
  });

program
  .command("purge")
  .description("PURGE TOTAL: delete snapshot + archives + garbage-collect orphan blobs (IRREVERSIBLE)")
  .requiredOption("--id <snapshotId>", "snapshot id")
  .option("--dry-run", "show what would be removed, but do nothing", false)
  .option("--yes", "confirm purge", false)
  .action(async (options) => {
    if (!options.yes) {
      console.log("❌ Confirmação necessária. Use: purge --id <ID> --yes");
      process.exitCode = 2;
      return;
    }

    const opts = program.opts();
    const cfg = await loadConfig(opts.config);

    const res = await purgeTotal(cfg, options.id, Boolean(options.dryRun));

    console.log(`✅ PURGE TOTAL ${res.dryRun ? "(dry-run)" : ""}`);
    console.log(`- snapshot.json: ${res.deletedSnapshot ? "deleted" : "not found"}`);
    console.log(`- archive.zip:   ${res.deletedZip ? "deleted" : "not found"}`);
    console.log(`- archive.7z:    ${res.deleted7z ? "deleted" : "not found"}`);
    console.log(
      `- GC: referenced hashes=${res.gc.snapshotsReferenced}, blobs=${res.gc.blobsTotal}, orphans=${res.gc.orphanCount}, removed=${res.gc.removedCount}, freed=${res.gc.bytesFreed} bytes`
    );
  });
  
await program.parseAsync(process.argv);
