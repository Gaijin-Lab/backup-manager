module.exports = {
  apps: [
    // 1) Watcher: detecta mudanças e faz backup
    {
      name: "smart-backup-watch",
      cwd: "/home/koji/projects/backup-manager",
      script: "node_modules/.bin/tsx",
      args: "src/index.ts watch",
      interpreter: "node",
      autorestart: true,
      max_memory_restart: "300M",
      time: true,
      out_file: "/home/koji/backup/logs/pm2-watch.out.log",
      error_file: "/home/koji/backup/logs/pm2-watch.err.log",
      env: {
        NODE_ENV: "production"
      }
    },

    // 2) Runner 6h: refaz backup a cada 6 horas, mesmo sem mudança
    {
      name: "smart-backup-6h",
      cwd: "/home/koji/projects/backup-manager",
      script: "/bin/bash",
      args: '-lc "while true; do node_modules/.bin/tsx src/index.ts run; sleep 21600; done"',
      autorestart: true,
      max_memory_restart: "300M",
      time: true,
      out_file: "/home/koji/backup/logs/pm2-6h.out.log",
      error_file: "/home/koji/backup/logs/pm2-6h.err.log",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
