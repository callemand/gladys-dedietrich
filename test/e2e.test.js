// End-to-end test: boots the REAL integration process (index.js) against a
// fake Gladys host (WebSocket + REST) and a fake De Dietrich cloud
// (B2C login + mobile API), then exercises discovery, scan, poll and set-value.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

import { DASHBOARD, APPLIANCE_ID, CLIMATE_ZONE_ID, DHW_ZONE_ID } from './fixtures.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SELECTOR = 'dedietrich-test';
const TOKEN = 'test-token';

async function waitUntil(predicate, what, timeoutMs = 10000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

// --- Fake De Dietrich cloud (B2C login + mobile API) -------------------
function startFakeCloud() {
  const requests = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      const url = new URL(req.url, 'http://localhost');
      let parsedBody = null;
      if (body) {
        try {
          parsedBody = JSON.parse(body);
        } catch {
          // Non-JSON body (e.g. the form-urlencoded SelfAsserted step).
          parsedBody = body;
        }
      }
      requests.push({ method: req.method, path: url.pathname, body: parsedBody });
      const send = (status, json, headers = {}) => {
        res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
        res.end(json === undefined ? '' : JSON.stringify(json));
      };

      if (url.pathname === '/oauth2/v2.0/authorize') {
        res.writeHead(200, {
          'Content-Type': 'text/html',
          'x-request-id': 'req-1',
          'Set-Cookie': ['x-ms-cpim-csrf=csrf-1; path=/; secure'],
        });
        res.end('<html></html>');
      } else if (url.pathname.endsWith('/SelfAsserted')) {
        send(200, { status: '200' }, { 'Set-Cookie': ['x-ms-cpim-sso=sess-1; path=/'] });
      } else if (url.pathname.endsWith('/CombinedSigninAndSignup/confirmed')) {
        res.writeHead(302, {
          Location: 'com.b2c.remehaapp://login-callback/?state=s&code=THE-CODE',
        });
        res.end();
      } else if (url.pathname === '/oauth2/v2.0/token') {
        send(200, { access_token: 'AT', refresh_token: 'RT', expires_in: 3600 });
      } else if (url.pathname === '/homes/dashboard') {
        send(200, DASHBOARD);
      } else if (url.pathname.includes('/energyconsumption/')) {
        send(200, {
          data: [
            { heatingEnergyConsumed: 1551, hotWaterEnergyConsumed: 664, coolingEnergyConsumed: 0 },
          ],
        });
      } else {
        // write endpoints
        send(200, {});
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, requests, port: server.address().port }));
  });
}

// --- Fake Gladys host (REST + WebSocket) -------------------------------------
function startFakeGladys() {
  const state = { discoveredDevicePosts: [], statePosts: [], commandResults: [], ws: null };
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      const respond = (json) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(json));
      };
      if (req.method === 'GET' && req.url === '/api/integration/v1/device') {
        respond([]);
      } else if (req.method === 'GET' && req.url === '/api/integration/v1/config') {
        respond({ config: { email: 'user@example.com', password: 'secret' } });
      } else if (req.method === 'POST' && req.url === '/api/integration/v1/discovered_device') {
        const parsed = JSON.parse(body);
        state.discoveredDevicePosts.push(parsed.devices);
        respond({ success: true, count: parsed.devices.length });
      } else if (req.method === 'POST' && req.url === '/api/integration/v1/state') {
        state.statePosts.push(JSON.parse(body).states);
        respond({ success: true });
      } else {
        res.writeHead(404);
        res.end();
      }
    });
  });
  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws) => {
    state.ws = ws;
    ws.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type === 'authenticate.integration-request' && message.payload.token === TOKEN) {
        ws.send(JSON.stringify({ type: 'authentication.connected', payload: {} }));
      }
      if (message.type === 'external-integration.command-result') {
        state.commandResults.push(message.payload);
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, state, port: server.address().port }));
  });
}

test('the integration discovers, polls and controls De Dietrich devices', async (t) => {
  const cloud = await startFakeCloud();
  const gladys = await startFakeGladys();
  t.after(() => {
    cloud.server.close();
    gladys.server.close();
  });

  let output = '';
  const cloudBase = `http://127.0.0.1:${cloud.port}`;
  const child = spawn(process.execPath, ['index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      GLADYS_HOST_API_URL: `http://127.0.0.1:${gladys.port}`,
      GLADYS_INTEGRATION_TOKEN: TOKEN,
      GLADYS_INTEGRATION_SELECTOR: SELECTOR,
      DEDIETRICH_LOGIN_BASE: cloudBase,
      DEDIETRICH_API_BASE: cloudBase,
      LOG_LEVEL: 'debug',
    },
  });
  child.stdout.on('data', (d) => {
    output += d;
  });
  child.stderr.on('data', (d) => {
    output += d;
  });
  t.after(() => child.kill('SIGKILL'));

  const send = (type, payload) => gladys.state.ws.send(JSON.stringify({ type, payload }));

  await t.test('on connection: logs in and publishes the discovered devices', async () => {
    await waitUntil(
      () => gladys.state.discoveredDevicePosts.length >= 1,
      `initial discovery\n${output}`,
    );

    assert.ok(
      cloud.requests.some((r) => r.path === '/oauth2/v2.0/token'),
      'the integration completed the OAuth flow',
    );

    const devices = gladys.state.discoveredDevicePosts.at(-1);
    assert.equal(devices.length, 2);
    assert.deepEqual(
      devices.map((d) => d.external_id),
      [`ext:${SELECTOR}:climate:${CLIMATE_ZONE_ID}`, `ext:${SELECTOR}:dhw:${DHW_ZONE_ID}`],
    );

    const climate = devices.find((d) => d.external_id.includes(':climate:'));
    assert.deepEqual(climate.params, [{ name: 'applianceId', value: APPLIANCE_ID }]);
    assert.deepEqual(
      climate.features.map((f) => f.external_id.split(':').pop()),
      [
        'target-temperature',
        'room-temperature',
        'outdoor-temperature',
        'water-pressure',
        'heating-energy',
      ],
    );

    const dhw = devices.find((d) => d.external_id.includes(':dhw:'));
    assert.deepEqual(
      dhw.features.map((f) => f.external_id.split(':').pop()),
      ['comfort-setpoint', 'water-temperature', 'hot-water-energy'],
    );
  });

  await t.test('a scan request republishes the devices', async () => {
    const before = gladys.state.discoveredDevicePosts.length;
    send('external-integration.scan-request', {});
    await waitUntil(
      () => gladys.state.discoveredDevicePosts.length > before,
      `scan republish\n${output}`,
    );
    assert.equal(gladys.state.discoveredDevicePosts.at(-1).length, 2);
  });

  const climateDevice = {
    external_id: `ext:${SELECTOR}:climate:${CLIMATE_ZONE_ID}`,
    params: [{ name: 'applianceId', value: APPLIANCE_ID }],
  };

  await t.test(
    'a poll publishes the climate states, shared sensors and heating energy',
    async () => {
      send('external-integration.device.poll', { message_id: 'poll-1', device: climateDevice });
      await waitUntil(
        () => gladys.state.commandResults.some((r) => r.message_id === 'poll-1'),
        `poll ack\n${output}`,
      );
      const ack = gladys.state.commandResults.find((r) => r.message_id === 'poll-1');
      assert.equal(ack.success, true, ack.error);

      const states = gladys.state.statePosts.at(-1);
      const byCode = Object.fromEntries(
        states.map((s) => [s.device_feature_external_id.split(':').pop(), s.state]),
      );
      assert.equal(byCode['target-temperature'], 19);
      assert.equal(byCode['room-temperature'], 26.5);
      assert.equal(byCode['outdoor-temperature'], 29);
      assert.equal(byCode['water-pressure'], 1.9);
      assert.equal(byCode['heating-energy'], 1551);
    },
  );

  await t.test('setting the climate target temperature posts a temporary override', async () => {
    send('external-integration.device.set-value', {
      message_id: 'set-1',
      device: climateDevice,
      device_feature: {
        external_id: `ext:${SELECTOR}:climate:${CLIMATE_ZONE_ID}:target-temperature`,
        category: 'thermostat',
        type: 'target-temperature',
      },
      value: 21,
    });
    await waitUntil(
      () => gladys.state.commandResults.some((r) => r.message_id === 'set-1'),
      `set ack\n${output}`,
    );
    const ack = gladys.state.commandResults.find((r) => r.message_id === 'set-1');
    assert.equal(ack.success, true, ack.error);

    const write = cloud.requests.findLast(
      (r) => r.method === 'POST' && r.path.includes('/climate-zones/'),
    );
    assert.ok(write, 'the integration called a climate-zones endpoint');
    assert.equal(write.path, `/climate-zones/${CLIMATE_ZONE_ID}/modes/temporary-override`);
    assert.deepEqual(write.body, { roomTemperatureSetPoint: 21 });
  });

  await t.test('setting the DHW comfort setpoint posts to the hot-water endpoint', async () => {
    send('external-integration.device.set-value', {
      message_id: 'set-2',
      device: {
        external_id: `ext:${SELECTOR}:dhw:${DHW_ZONE_ID}`,
        params: [{ name: 'applianceId', value: APPLIANCE_ID }],
      },
      device_feature: {
        external_id: `ext:${SELECTOR}:dhw:${DHW_ZONE_ID}:comfort-setpoint`,
        category: 'thermostat',
        type: 'target-temperature',
      },
      value: 52,
    });
    await waitUntil(
      () => gladys.state.commandResults.some((r) => r.message_id === 'set-2'),
      `dhw set ack\n${output}`,
    );
    const ack = gladys.state.commandResults.find((r) => r.message_id === 'set-2');
    assert.equal(ack.success, true, ack.error);

    const write = cloud.requests.findLast(
      (r) => r.method === 'POST' && r.path.includes('/hot-water-zones/'),
    );
    assert.equal(write.path, `/hot-water-zones/${DHW_ZONE_ID}/comfort-setpoint`);
    assert.deepEqual(write.body, { comfortSetpoint: 52 });
  });

  await t.test('a DHW poll publishes the hot-water energy', async () => {
    send('external-integration.device.poll', {
      message_id: 'poll-dhw',
      device: {
        external_id: `ext:${SELECTOR}:dhw:${DHW_ZONE_ID}`,
        params: [{ name: 'applianceId', value: APPLIANCE_ID }],
      },
    });
    await waitUntil(
      () => gladys.state.commandResults.some((r) => r.message_id === 'poll-dhw'),
      `dhw poll ack\n${output}`,
    );
    const ack = gladys.state.commandResults.find((r) => r.message_id === 'poll-dhw');
    assert.equal(ack.success, true, ack.error);

    const states = gladys.state.statePosts.at(-1);
    const byCode = Object.fromEntries(
      states.map((s) => [s.device_feature_external_id.split(':').pop(), s.state]),
    );
    assert.equal(byCode['comfort-setpoint'], 50);
    assert.equal(byCode['water-temperature'], 54.6);
    assert.equal(byCode['hot-water-energy'], 664);
  });

  await t.test('a set-value on a read-only feature is acked as failed', async () => {
    send('external-integration.device.set-value', {
      message_id: 'set-3',
      device: climateDevice,
      device_feature: {
        external_id: `ext:${SELECTOR}:climate:${CLIMATE_ZONE_ID}:room-temperature`,
        category: 'temperature-sensor',
        type: 'decimal',
      },
      value: 20,
    });
    await waitUntil(
      () => gladys.state.commandResults.some((r) => r.message_id === 'set-3'),
      `fail ack\n${output}`,
    );
    const ack = gladys.state.commandResults.find((r) => r.message_id === 'set-3');
    assert.equal(ack.success, false);
    assert.match(ack.error, /not controllable/);
  });
});
