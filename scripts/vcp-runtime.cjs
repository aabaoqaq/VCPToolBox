'use strict';

// Read-only probes. PM2's normal connect/list API can create a daemon.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const pm2Root = path.dirname(require.resolve('pm2/package.json'));

function check() {
  const config = require('dotenv').parse(fs.readFileSync(path.join(root, 'config.env')));
  // dotenv does not overwrite an already-defined environment variable.
  const port = Number(process.env.PORT ?? config.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65534) {
    throw new Error('config.env PORT must be an integer from 1 to 65534.');
  }
  if (!fs.existsSync(path.join(root, 'AdminPanel-Vue/dist/index.html'))) {
    throw new Error('AdminPanel-Vue/dist/index.html is missing. Build the frontend explicitly first.');
  }
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  try { db.prepare('SELECT 1').get(); } finally { db.close(); }
  console.log(JSON.stringify({
    node: process.version, abi: process.versions.modules, exe: process.execPath,
    pm2: require('pm2/package.json').version,
    daemonScript: path.join(pm2Root, 'lib/Daemon.js'), port, adminPort: port + 1
  }));
}

function status() {
  // Reuse installed PM2 RPC without starting processes or exposing app env/secrets.
  const axon = require(path.join(pm2Root, 'modules/pm2-axon'));
  const rpc = require(path.join(pm2Root, 'modules/pm2-axon-rpc'));
  const socket = axon.socket('req');
  const client = new rpc.Client(socket);
  let finished = false;
  const timer = setTimeout(() => finish(new Error('PM2 RPC timeout; no daemon was started.')), 8000);
  function finish(error, apps) {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    socket.close();
    if (error) {
      console.error(String(error.message || error));
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify(apps.map(app => {
        const env = app.pm2_env || {};
        return {
          name: app.name, pid: app.pid, status: env.status,
          restarts: env.restart_time, interpreter: env.exec_interpreter,
          script: env.pm_exec_path, cwd: env.pm_cwd, pmx: env.pmx,
          node: env.node_version, threadpool: env.UV_THREADPOOL_SIZE
        };
      })));
    }
  }
  socket.on('error', error => finish(error));
  const paths = require(path.join(pm2Root, 'paths'))(process.env.PM2_HOME);
  socket.connect(paths.DAEMON_RPC_PORT);
  client.call('getMonitorData', {}, (error, apps) => finish(error, apps));
}

try {
  if (process.argv[2] === 'check') check();
  else if (process.argv[2] === 'status') status();
  else throw new Error('Usage: node scripts/vcp-runtime.cjs check|status');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
