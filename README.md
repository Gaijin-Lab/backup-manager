# 🛡️ Smart Backup Manager

Sistema de **backup incremental inteligente**, multiplataforma (**Linux / Windows**), desenvolvido em **Node.js + TypeScript**, sem frontend web.

Ideal para:

- Projetos de desenvolvimento  
- Pastas de documentos  
- Configurações críticas  
- Ambientes locais ou VPS  

---

## ✨ Funcionalidades

- 📁 Monitoramento de pastas configuradas (`watch`)
- 🧠 Detecção automática de mudanças
- 📦 Backups incrementais com **deduplicação por hash (blobs)**
- 🗂 Snapshots versionados em **JSON**
- 🔐 Compactação opcional com **criptografia**
- ♻️ Retenção automática (7, 15 ou 30 dias)
- 🧹 Purge total com **garbage collection**
- 🔄 Restauração completa de qualquer snapshot
- ⚙️ Automação 24/7 com **PM2**

---

## 📦 Estrutura de Backup

```text
repoPath/
├── blobs/       # Arquivos deduplicados (hash)
├── snapshots/   # Metadados dos backups (.json)
├── archives/    # Arquivos zip / 7z (optional)
└── logs/        # Logs de execução
```

---

## ⚙️ Configuração

### `config.json`

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
  "debounceSeconds": 10,
  "archive": {
    "enabled": true,
    "encrypt": true
  }
}
```

### `.env`

```env
BACKUP_PASSWORD=senha_super_secreta
```

Necessário apenas se `archive.enabled = true` e `archive.encrypt = true`.

---

## 🚀 Comandos CLI

### Rodar backup manual

```bash
npm run dev -- run
```

### Monitorar mudanças (watch)

```bash
npm run dev -- watch
```

### Listar snapshots

```bash
npm run list
```

### Restaurar snapshot

```bash
npm run restore -- --id <SNAPSHOT_ID>
```

### Apagar snapshot (lógico)

```bash
npm run delete -- --id <SNAPSHOT_ID> --yes
```

---

## 🔥 Purge Total (IRREVERSÍVEL)

Remove snapshot + archive + blobs órfãos.

### Execução real

```bash
npm run purge -- --id <SNAPSHOT_ID> --yes
```

### Simulação (dry-run)

```bash
npm run purge -- --id <SNAPSHOT_ID> --dry-run --yes
```

---

## 🔁 Automação 24/7 (PM2)

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

## 🛠 Tecnologias Utilizadas

- Node.js  
- TypeScript  
- Commander  
- Chokidar  
- Archiver  
- Crypto  
- PM2  

---

## 📌 Observações

- O sistema **não sobrescreve backups**: tudo é versionado.
- A **deduplicação reduz drasticamente o uso de disco**.
- Ideal para execução contínua em **servidores ou máquinas locais**.
