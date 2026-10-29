// `pnpm dev` starts the API first, waits for its demo-account route, then
// starts Vite. Both are direct child processes so Ctrl+C cannot leave a
// nested `node --watch` server orphaned on Windows.
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.join(__dirname, '..');
const children = new Set();
let stopping = false;

function canBind(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    // Match server.js's default unspecified-address bind so an IPv6 listener
    // on Windows is treated as occupied too.
    probe.listen(port, () => probe.close(() => resolve(true)));
  });
}

async function availableApiPort(preferred = 3000, probe = canBind) {
  const lastPort = Math.min(preferred + 99, 65535);
  for (let port = preferred; port <= lastPort; port++) {
    if (await probe(port)) return port;
  }
  throw new Error(`No free API port found from ${preferred} to ${lastPort}.`);
}

function hasSeededDemoAccounts(users) {
  return Array.isArray(users) && users.some((user) => user.id === 's-01' && user.email === 'student01@quizquest.demo');
}

function supportsCurrentHeroLab(status) {
  return Array.isArray(status?.heroLabHeroes) && status.heroLabHeroes.includes('fairy');
}

async function isDemoApiReady(port) {
  try {
    const health = await fetch(`http://127.0.0.1:${port}/api/dev-ready`, { signal: AbortSignal.timeout(1000) });
    if (!health.ok) return false;
    const status = await health.json();
    if (status.ready !== true || !status.demoAccounts || !supportsCurrentHeroLab(status)) return false;
    const response = await fetch(`http://127.0.0.1:${port}/api/demo-users`, { signal: AbortSignal.timeout(1000) });
    return response.ok && hasSeededDemoAccounts(await response.json());
  } catch {
    return false;
  }
}

function startChild(args, env) {
  const child = spawn(process.execPath, args, { cwd: root, env, stdio: 'inherit' });
  children.add(child);
  child.once('exit', (code, signal) => {
    children.delete(child);
    if (!stopping) {
      const reason = signal ? `signal ${signal}` : `exit code ${code}`;
      console.error(`[dev] A development process stopped (${reason}). Stopping the other process.`);
      stop(code || 1);
    }
  });
  child.once('error', (error) => {
    console.error(`[dev] Could not start ${args.join(' ')}: ${error.message}`);
    stop(1);
  });
  return child;
}

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  const active = [...children];
  if (!active.length) {
    process.exitCode = exitCode;
    return;
  }
  for (const child of active) child.kill();
  Promise.all(active.map((child) => new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once('exit', resolve);
  }))).then(() => { process.exitCode = exitCode; });
}

async function waitForApi(child, port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'not ready';
  while (Date.now() < deadline && !stopping) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error('The API process exited before it became ready.');
    }
    try {
      const health = await fetch(`http://127.0.0.1:${port}/api/dev-ready`, { signal: AbortSignal.timeout(1000) });
      if (!health.ok) {
        lastError = `the dev health endpoint returned HTTP ${health.status}`;
        await new Promise((resolve) => setTimeout(resolve, 250));
        continue;
      }
      const status = await health.json();
      if (status.ready !== true || !status.demoAccounts) {
        lastError = 'the dev server has no seeded demo accounts';
        await new Promise((resolve) => setTimeout(resolve, 250));
        continue;
      }
      if (!supportsCurrentHeroLab(status)) {
        lastError = 'the dev server does not include the current Hero Lab roster';
        await new Promise((resolve) => setTimeout(resolve, 250));
        continue;
      }
      const response = await fetch(`http://127.0.0.1:${port}/api/demo-users`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        const users = await response.json();
        if (hasSeededDemoAccounts(users)) return;
        lastError = 'the demo-account endpoint did not return the seeded test account';
      } else {
        lastError = `the demo-account endpoint returned HTTP ${response.status}`;
      }
    } catch (error) {
      lastError = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`API did not become ready on port ${port}: ${lastError}`);
}

async function main() {
  const requestedPort = Number(process.env.PORT || 3000);
  if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65535) {
    throw new Error(`Invalid PORT value: ${process.env.PORT}`);
  }
  let apiPort = requestedPort;
  let api = null;
  if (await isDemoApiReady(apiPort)) {
    console.log(`[dev] Reusing the API already serving demo accounts on port ${apiPort}.`);
  } else {
    apiPort = await availableApiPort(requestedPort);
    if (apiPort !== requestedPort) {
      console.warn(`[dev] Port ${requestedPort} is busy; using API port ${apiPort}.`);
    }
    const env = { ...process.env, PORT: String(apiPort), QUIZQUEST_DEV: '1' };
    api = startChild(['--env-file-if-exists=.env', 'server.js'], env);
    console.log(`[dev] Waiting for the API and demo accounts on port ${apiPort}…`);
    await waitForApi(api, apiPort);
  }
  if (stopping) return;
  console.log(`[dev] API ready at http://localhost:${apiPort}.`);
  const env = { ...process.env, PORT: String(apiPort), QUIZQUEST_DEV: '1' };
  startChild([path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')], env);
}

if (require.main === module) {
  process.on('SIGINT', () => stop(0));
  process.on('SIGTERM', () => stop(0));
  main().catch((error) => {
    console.error(`[dev] ${error.message}`);
    stop(1);
  });
}

module.exports = { availableApiPort, canBind, hasSeededDemoAccounts, supportsCurrentHeroLab };
