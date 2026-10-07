// `npm run dev`: the Node API/World server (restarts on change) and the
// Vite dev server (hot reload for the Vue app) side by side.
// Open http://localhost:5173 - Vite forwards /api and /socket.io to Node.
const path = require('node:path');
const { spawn } = require('node:child_process');

const procs = [
  spawn(process.execPath, ['--watch', '--env-file-if-exists=.env', 'server.js'], { stdio: 'inherit' }),
  spawn(process.execPath, [path.join(__dirname, '..', 'node_modules', 'vite', 'bin', 'vite.js')], { stdio: 'inherit' }),
];
const stop = () => {
  for (const p of procs) p.kill();
  process.exit();
};
for (const p of procs) p.on('exit', (code) => code && stop());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
