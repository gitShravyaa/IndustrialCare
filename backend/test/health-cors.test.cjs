const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { test } = require('node:test');

const backendRoot = path.resolve(__dirname, '..');
const productionOrigin = 'https://industrial-care.vercel.app';

async function findAvailablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  return port;
}

function getHealth(port) {
  return new Promise((resolve, reject) => {
    const request = http.get({
      hostname: '127.0.0.1',
      port,
      path: '/health',
      headers: { Origin: productionOrigin },
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({
        statusCode: response.statusCode,
        headers: response.headers,
        body,
      }));
    });
    request.setTimeout(3000, () => request.destroy(new Error('Health request timed out.')));
    request.on('error', reject);
  });
}

test('GET /health allows the production Vercel Origin when env config differs', { timeout: 20000 }, async (t) => {
  const port = await findAvailablePort();
  const backend = spawn(process.execPath, ['dist/server.js'], {
    cwd: backendRoot,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: 'https://another-site.example',
    },
    stdio: 'ignore',
  });
  t.after(() => {
    if (backend.exitCode === null) backend.kill();
  });

  let response;
  let lastError;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (backend.exitCode !== null) {
      throw new Error(`Backend exited before becoming ready (code ${backend.exitCode}).`);
    }
    try {
      response = await getHealth(port);
      break;
    } catch (error) {
      lastError = error;
      await delay(100);
    }
  }

  assert.ok(response, `Backend did not become ready: ${lastError}`);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['access-control-allow-origin'], productionOrigin);
  assert.deepEqual(JSON.parse(response.body), {
    ok: true,
    service: 'industrialcare-api',
  });
});
