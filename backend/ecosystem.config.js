module.exports = {
  apps: [
    {
      name: 'elio-hpp-backend',
      script: './dist/server.js',
      cwd: __dirname,
      env: { NODE_ENV: 'production' },
      instances: 1,
      autorestart: true
    }
  ]
};
