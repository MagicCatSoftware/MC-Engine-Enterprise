// PM2 process configuration — used for production deployment.
// Start:   pm2 start ecosystem.config.js
// Reload:  pm2 reload mcengine
// Logs:    pm2 logs mcengine

module.exports = {
  apps: [
    {
      name:        'mcengine',
      script:      './server.js',
      instances:   1,
      autorestart: true,
      watch:       false,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'production',
        PORT:     3000,
      },
      // env_file loads from .env automatically via dotenv in server.js
      error_file: './logs/error.log',
      out_file:   './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
