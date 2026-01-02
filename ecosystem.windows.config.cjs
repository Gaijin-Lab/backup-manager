module.exports = {
  apps: [
    {
      name: "smart-backup-watch",
      cwd: "C:\\projects\\backup-manager",
      script: "node_modules\\.bin\\tsx.cmd",
      args: "src\\index.ts watch",
      autorestart: true,
      max_memory_restart: "300M",
      time: true
    },
    {
      name: "smart-backup-6h",
      cwd: "C:\\projects\\backup-manager",
      script: "cmd.exe",
      args: "/c node_modules\\.bin\\tsx.cmd src\\index.ts run && timeout /t 21600",
      autorestart: true,
      max_memory_restart: "300M",
      time: true
    }
  ]
};
