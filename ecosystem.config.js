module.exports = {
  apps: [
    {
      name: "backend",
      script: ".venv/bin/uvicorn",
      args: "app.main:app --host 0.0.0.0 --port 8000",
      cwd: "/Users/galiyawarrier/claude/personal-crm/backend",
      interpreter: "none",
      autorestart: true,
      max_restarts: 10,
      watch: false,
      out_file: "/Users/galiyawarrier/claude/personal-crm/logs/backend-out.log",
      error_file: "/Users/galiyawarrier/claude/personal-crm/logs/backend-err.log",
      merge_logs: false,
    },
    {
      name: "frontend",
      script: "npm",
      args: "run dev",
      cwd: "/Users/galiyawarrier/claude/personal-crm/frontend",
      autorestart: true,
      max_restarts: 10,
      watch: false,
      out_file: "/Users/galiyawarrier/claude/personal-crm/logs/frontend-out.log",
      error_file: "/Users/galiyawarrier/claude/personal-crm/logs/frontend-err.log",
      merge_logs: false,
    },
  ],
};
