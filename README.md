# Smart Backup Manager

A smart incremental backup system, cross-platform (Linux / Windows), built with Node.js + TypeScript, without any web frontend.

Designed for:

- Development projects
- Document folders
- Critical configurations
- Local environments or VPS servers

---

## Features

- Configurable directory monitoring (watch)
- Incremental backups based on file hash changes
- Versioned snapshots stored as JSON
- Encrypted 7z archives (password from .env)
- Automatic retention policy (7, 15, 30 days)
- Restore from any snapshot archive
- Terminal notifications with chalk
- 24/7 automation using PM2

---

## Backup Structure

```text
repoPath/
  snapshots/   # Backup metadata (.json)
  archives/    # 7z archives (encrypted)
  logs/        # Execution logs
  .tmp/        # Temporary lists for 7z
```

---

## Configuration

> This file must NOT be committed to the repository.
> Use config.json.exemple as a base.

### config.json (example)

```json
{
  "repoPath": "C:/Backups/backup-manager",
  "sources": [
    "C:/Projects/example-project"
  ],
  "restorePath": "C:/Backups/backup-manager/restore",
  "ignore": [
    "**/.git/**",
    "**/node_modules/**",
    "**/.cache/**",
    "**/dist/**",
    "**/build/**"
  ],
  "retentionDays": 15,
  "debounceSeconds": 10
}
```

### .env

```env
BACKUP_PASSWORD=change_me
# Optional override for 7z binary
# SEVEN_ZIP_BIN=C:\Program Files\7-Zip\7z.exe
```

7-Zip is required and must be available on PATH or via SEVEN_ZIP_BIN.

---

## CLI Commands

Default behavior runs a backup when no subcommand is provided. The aliases below simplify common tasks.

### Run a manual backup

```bash
npm run backup
```

### Watch for changes

```bash
npm run backup:watch
```

### Check if files changed since last snapshot

```bash
npm run backup:check
```

### List snapshots

```bash
npm run list
```

### Restore a snapshot

```bash
npm run restore -- --id <SNAPSHOT_ID>
```

### Delete a snapshot

```bash
npm run delete -- --id <SNAPSHOT_ID> --yes
```

---

## Full Purge (IRREVERSIBLE)

Removes snapshot and archive.

### Real execution

```bash
npm run purge -- --id <SNAPSHOT_ID> --yes
```

### Dry-run (simulation)

```bash
npm run purge -- --id <SNAPSHOT_ID> --dry-run --yes
```

---

## 24/7 Automation (PM2)

### Linux

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

### Windows

```bat
pm2 start ecosystem.windows.config.cjs
pm2 save
```

---

## Technologies Used

- Node.js
- TypeScript
- Commander
- Chokidar
- fast-glob
- Chalk
- 7-Zip

---

## Notes

- Backups are never overwritten; everything is versioned.
- No blob store is used; each backup is a full archive created only when files change.
- Archives are encrypted with BACKUP_PASSWORD.

---

## Usage Policy and Ethics

This project is open-source and distributed under the MIT License.
In addition to the license terms, the following guidelines promote ethical, transparent, and responsible usage.

### Commercial Resale
- This project should not be resold as-is, rebranded, or distributed commercially without significant original modifications.
- Selling this software alone, or bundling it as a paid product without meaningful added value, is strongly discouraged.

> Note: This is an ethical guideline, not a legal restriction.
> The MIT License still applies.

---

### Modifications and Derivative Works
- Forks and modifications are allowed and encouraged.
- If you modify or extend this project:
  - Clearly document your changes
  - Do not remove credits or misrepresent authorship
  - Inform end users when behavior differs from the original project

---

### Privacy and Usage Data
- This software does not collect, transmit, or share usage data by default.
- If you add telemetry, analytics, or remote logging:
  - You must explicitly inform users
  - You must provide a way to disable it
  - Hidden data collection is strongly discouraged

---

### Responsible Use
This project must not be used for:
- Malicious activity
- Unauthorized data access
- Circumventing security controls

The author is not responsible for misuse or damages caused by improper configuration or usage.

---

## Artificial Intelligence Usage

This project uses AI-assisted development as a support tool, including:
- Code review and refactoring
- Bug detection and correction
- Documentation improvements

All final architectural decisions, validations, and implementations are performed by a human developer.

> AI is used as an assistive technology, not as an autonomous system.

---

## License

This project is licensed under the MIT License.

GAIJIN LAB 2026
