module.exports = {
  apps: [{
    name: 'hearts',
    script: './server.js',
    cwd: __dirname,
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    wait_ready: true,
    listen_timeout: 10000,
    kill_timeout: 7000,
    max_memory_restart: '350M',
    exp_backoff_restart_delay: 100,
    time: true,
    env: {
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: '3000',
      TRUST_PROXY: '1',
      QQ_APP_ID: '1904930904',
      QQ_CALLBACK_URL: 'https://hearts.duanap.cn/qq-callback.html',
      ALLOWED_HOSTS: 'hearts.duanap.cn,localhost,127.0.0.1',
      ALLOWED_ORIGINS: 'https://hearts.duanap.cn',
      WS_PATHS: '/ws,/',
      WS_HEARTBEAT_MS: '10000',
      WS_MAX_PAYLOAD: '65536',
      WS_MAX_BUFFERED_AMOUNT: '1048576',
      WS_MESSAGE_LIMIT: '80',
      WS_MESSAGE_WINDOW_MS: '10000',
      HTTP_KEEP_ALIVE_TIMEOUT_MS: '65000',
      HTTP_HEADERS_TIMEOUT_MS: '70000',
      DATA_BACKEND: 'sqlite',
      DATABASE_FILE: '/www/wwwroot/duanap/apps/hearts/hearts-by-duanap/data/hearts.sqlite',
      ADMIN_SESSION_TTL_MS: '28800000',
      AI_LEARNING_STATE_FILE: '/www/wwwroot/duanap/apps/hearts/hearts-by-duanap/data/ai-learning-state.json'
    }
  }]
};
