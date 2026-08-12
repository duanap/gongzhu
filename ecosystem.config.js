module.exports = {
  apps: [{
    name: 'gongzhu',
    script: './server.js',
    cwd: __dirname,
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    kill_timeout: 7000,
    max_memory_restart: '300M',
    exp_backoff_restart_delay: 100,
    time: true,
    env: {
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: '3010',
      ALLOWED_HOSTS: 'gognzhu.duanap.cn,localhost,127.0.0.1',
      ALLOWED_ORIGINS: 'https://gognzhu.duanap.cn',
      WS_PATHS: '/ws'
    }
  }]
};
