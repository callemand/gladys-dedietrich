import test from 'node:test';
import assert from 'node:assert/strict';

import { DeDietrichClient } from '../src/bdr/client.js';
import { DASHBOARD, CLIMATE_ZONE_ID, DHW_ZONE_ID } from './fixtures.js';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null, getSetCookie: () => [] },
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  };
}

// A fake fetch routing by URL. `onDashboard` lets a test inject a transient 401.
function makeFetch({ onDashboard } = {}) {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    const u = String(url);
    requests.push({ url: u, method: options.method || 'GET', body: options.body });
    if (u.includes('/oauth2/v2.0/token')) {
      return jsonResponse(200, {
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        expires_in: 3600,
      });
    }
    if (u.endsWith('/homes/dashboard')) {
      const forced = onDashboard && onDashboard(requests);
      if (forced) {
        return forced;
      }
      return jsonResponse(200, DASHBOARD);
    }
    // write endpoints
    return jsonResponse(200, {});
  };
  return { fetchImpl, requests };
}

function loggedInClient(fetchImpl) {
  const client = new DeDietrichClient({ fetchImpl });
  client.accessToken = 'access';
  client.refreshToken = 'refresh';
  client.credentials = { email: 'a@b.c', password: 'x' };
  return client;
}

test('getDashboard caches the payload within the TTL', async () => {
  const { fetchImpl, requests } = makeFetch();
  const client = loggedInClient(fetchImpl);

  const first = await client.getDashboard();
  const second = await client.getDashboard();
  assert.equal(first, second);
  assert.equal(requests.filter((r) => r.url.endsWith('/homes/dashboard')).length, 1);

  const forced = await client.getDashboard({ force: true });
  assert.deepEqual(forced, DASHBOARD);
  assert.equal(requests.filter((r) => r.url.endsWith('/homes/dashboard')).length, 2);
});

test('a 401 triggers a token refresh and one retry', async () => {
  let served401 = false;
  const { fetchImpl, requests } = makeFetch({
    onDashboard: () => {
      if (!served401) {
        served401 = true;
        return jsonResponse(401);
      }
      return null;
    },
  });
  const client = loggedInClient(fetchImpl);

  const dashboard = await client.getDashboard();
  assert.deepEqual(dashboard, DASHBOARD);
  assert.ok(
    requests.some((r) => r.url.includes('/oauth2/v2.0/token')),
    'the client refreshed the token',
  );
  assert.equal(client.accessToken, 'new-access');
});

test('setClimateSetpoint uses temporary-override when the zone follows its schedule', async () => {
  const { fetchImpl, requests } = makeFetch();
  const client = loggedInClient(fetchImpl);

  await client.setClimateSetpoint(CLIMATE_ZONE_ID, 20, 'Scheduling');
  const call = requests.at(-1);
  assert.equal(call.method, 'POST');
  assert.equal(
    call.url.endsWith(`/climate-zones/${CLIMATE_ZONE_ID}/modes/temporary-override`),
    true,
  );
  assert.deepEqual(JSON.parse(call.body), { roomTemperatureSetPoint: 20 });
});

test('setClimateSetpoint uses manual mode otherwise', async () => {
  const { fetchImpl, requests } = makeFetch();
  const client = loggedInClient(fetchImpl);

  await client.setClimateSetpoint(CLIMATE_ZONE_ID, 18, 'FrostProtection');
  const call = requests.at(-1);
  assert.equal(call.url.endsWith(`/climate-zones/${CLIMATE_ZONE_ID}/modes/manual`), true);
  assert.deepEqual(JSON.parse(call.body), { roomTemperatureSetPoint: 18 });
});

test('setDhwComfortSetpoint posts the comfort setpoint', async () => {
  const { fetchImpl, requests } = makeFetch();
  const client = loggedInClient(fetchImpl);

  await client.setDhwComfortSetpoint(DHW_ZONE_ID, 55);
  const call = requests.at(-1);
  assert.equal(call.url.endsWith(`/hot-water-zones/${DHW_ZONE_ID}/comfort-setpoint`), true);
  assert.deepEqual(JSON.parse(call.body), { comfortSetpoint: 55 });
});

test('a write invalidates the dashboard cache', async () => {
  const { fetchImpl, requests } = makeFetch();
  const client = loggedInClient(fetchImpl);

  await client.getDashboard();
  await client.setDhwComfortSetpoint(DHW_ZONE_ID, 55);
  await client.getDashboard();
  assert.equal(requests.filter((r) => r.url.endsWith('/homes/dashboard')).length, 2);
});
