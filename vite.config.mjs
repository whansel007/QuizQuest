// Vite builds the Vue app in web/ into dist/, which server.js serves in
// production. In development, `npm run dev` runs Vite (port 5173) next to
// the Node server (port 3000); Vite forwards API, Socket.IO and Circle Tag
// requests to Node so the browser only ever talks to one address.
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const node = 'http://localhost:' + (process.env.PORT || 3000);

export default defineConfig({
  root: 'web',
  plugins: [vue()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': node,
      '/socket.io': { target: node, ws: true },
      '^/tag$': node,
      '/client.js': node,
      '/hero-lab': node,
    },
  },
});
