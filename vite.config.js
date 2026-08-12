const { defineConfig } = require('vite');
const vue = require('@vitejs/plugin-vue');

module.exports = defineConfig({
  root: 'src/client',
  base: '/',
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3010',
      '/ws': {
        target: 'ws://127.0.0.1:3010',
        ws: true
      }
    }
  },
  build: {
    outDir: '../../public',
    emptyOutDir: true
  }
});
