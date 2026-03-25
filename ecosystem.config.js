module.exports = {
  apps: [
    {
      name: "crm-backend",
      script: ".venv/bin/uvicorn",
      args: "app.main:app --host 0.0.0.0 --port 8000",
      cwd: "/Users/galiyawarrier/claude/personal-crm/backend",
      interpreter: "none",
      autorestart: true,
      max_restarts: 10,
      watch: false,
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      env: {
        DOTENV_PATH: ".env",
      },
    },
    {
      name: "crm-frontend",
      script: "npm",
      args: "run dev",
      cwd: "/Users/galiyawarrier/claude/personal-crm/frontend",
      interpreter: "none",
      autorestart: true,
      max_restarts: 10,
      watch: false,
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
