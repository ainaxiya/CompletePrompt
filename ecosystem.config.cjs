// PM2 进程配置（宝塔 Node/PM2 项目使用）
// 用法：pm2 start ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [
    {
      name: "CompletePrompt",
      // Next.js 生产模式启动（需先执行 npm run build）
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
      max_memory_restart: "1G",
      autorestart: true,
      max_restarts: 10,
    },
  ],
};
