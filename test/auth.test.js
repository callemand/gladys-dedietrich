import test from 'node:test';
import assert from 'node:assert/strict';

import { login, refresh } from '../src/bdr/auth.js';

function response({ status = 200, headers = {}, setCookies = [], body = '' }) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) => lower[name.toLowerCase()] ?? null,
      getSetCookie: () => setCookies,
    },
    text: async () => body,
  };
}

// A fake B2C + token server driving the four-step flow. `credentialsOk` toggles
// the SelfAsserted result to exercise the bad-password path.
function makeB2C({ credentialsOk = true } = {}) {
  const seen = [];
  const fetchImpl = async (url, options = {}) => {
    const u = String(url);
    seen.push({ u, method: options.method || 'GET' });
    if (u.includes('/oauth2/v2.0/authorize')) {
      return response({
        headers: { 'x-request-id': 'req-1' },
        setCookies: ['x-ms-cpim-csrf=csrf-1; path=/; secure'],
      });
    }
    if (u.includes('/SelfAsserted')) {
      return response({
        body: JSON.stringify({ status: credentialsOk ? '200' : '400' }),
        setCookies: ['x-ms-cpim-sso=sess-1; path=/'],
      });
    }
    if (u.includes('/CombinedSigninAndSignup/confirmed')) {
      return response({
        status: 302,
        headers: { location: 'com.b2c.remehaapp://login-callback/?state=s&code=THE-CODE' },
      });
    }
    if (u.includes('/oauth2/v2.0/token')) {
      return response({
        body: JSON.stringify({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }),
      });
    }
    throw new Error(`unexpected url ${u}`);
  };
  return { fetchImpl, seen };
}

test('login runs the B2C flow and returns tokens', async () => {
  const { fetchImpl, seen } = makeB2C();
  const tokens = await login('user@example.com', 'secret', fetchImpl);
  assert.deepEqual(tokens, { accessToken: 'AT', refreshToken: 'RT', expiresIn: 3600 });

  // The credentials were submitted to SelfAsserted with the CSRF token.
  const selfAsserted = seen.find((r) => r.u.includes('/SelfAsserted'));
  assert.ok(selfAsserted, 'the credentials step ran');
  // The token exchange happened last.
  assert.ok(seen.at(-1).u.includes('/oauth2/v2.0/token'));
});

test('login rejects bad credentials', async () => {
  const { fetchImpl } = makeB2C({ credentialsOk: false });
  await assert.rejects(() => login('user@example.com', 'wrong', fetchImpl), /email and password/);
});

test('refresh exchanges a refresh token for a new access token', async () => {
  const { fetchImpl, seen } = makeB2C();
  const tokens = await refresh('RT', fetchImpl);
  assert.equal(tokens.accessToken, 'AT');
  assert.equal(seen.length, 1);
  assert.ok(seen[0].u.includes('/oauth2/v2.0/token'));
});
