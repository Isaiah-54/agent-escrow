module.exports = {
  apps: [
    {
      name: "agent-escrow",
      script: "npm",
      args: "start",
      cwd: "/root/agent-escrow",
      env: { NODE_ENV: "production", PORT: 3000 },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
    },
  ],
};
