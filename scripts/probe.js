// -----------------------------------------------------------------------------
// One-shot probe: log in to the BDR Thermea cloud (used by the De Dietrich
// app) with the Azure AD B2C OAuth2 flow, then dump the real
// /homes/dashboard payload so we can map the exact field shapes.
//
// Usage:
//   DEDIETRICH_EMAIL="..." DEDIETRICH_PASSWORD="..." node scripts/probe.js
//
// This file is a dev tool only; it is not shipped in the Docker image.
// -----------------------------------------------------------------------------

import crypto from 'node:crypto';

const LOGIN_BASE = 'https://remehalogin.bdrthermea.net/bdrb2cprod.onmicrosoft.com';
const POLICY = 'B2C_1A_RPSignUpSignInNewRoomV3.1';
const CLIENT_ID = '6ce007c6-0628-419e-88f4-bee2e6418eec';
const REDIRECT_URI = 'com.b2c.remehaapp://login-callback';
const SCOPE =
  'openid https://bdrb2cprod.onmicrosoft.com/iotdevice/user_impersonation offline_access';
const API_BASE = 'https://api.bdrthermea.net/Mobile/api';
const SUBSCRIPTION_KEY = 'df605c5470d846fc91e848b1cc653ddf';

const email = process.env.DEDIETRICH_EMAIL;
const password = process.env.DEDIETRICH_PASSWORD;
if (!email || !password) {
  console.error('Set DEDIETRICH_EMAIL and DEDIETRICH_PASSWORD env vars');
  process.exit(1);
}

function base64UrlNoPad(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function parseSetCookies(response) {
  const jar = {};
  // Node 20+ exposes getSetCookie(); fall back to the raw header otherwise.
  const raw =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie')].filter(Boolean);
  for (const line of raw) {
    const [pair] = line.split(';');
    const idx = pair.indexOf('=');
    if (idx > 0) {
      jar[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
    }
  }
  return jar;
}

async function login() {
  const codeVerifier = base64UrlNoPad(crypto.randomBytes(64));
  const codeChallenge = base64UrlNoPad(crypto.createHash('sha256').update(codeVerifier).digest());
  const state = base64UrlNoPad(crypto.randomBytes(32));

  // 1) Authorization request -> HTML page, plus the CSRF cookie and request id.
  const authorizeUrl = new URL(`${LOGIN_BASE}/oauth2/v2.0/authorize`);
  authorizeUrl.search = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    p: POLICY,
    brand: 'remeha',
    lang: 'en',
    nonce: 'defaultNonce',
    prompt: 'login',
    signUp: 'False',
  }).toString();

  const authorizeResponse = await fetch(authorizeUrl, { redirect: 'manual' });
  const requestId = authorizeResponse.headers.get('x-request-id');
  const cookies = parseSetCookies(authorizeResponse);
  const csrfToken = cookies['x-ms-cpim-csrf'];
  const stateProperties = base64UrlNoPad(Buffer.from(JSON.stringify({ TID: requestId })));
  console.error(`[login] authorize status=${authorizeResponse.status} csrf=${!!csrfToken}`);

  const cookieHeader = () =>
    Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');

  // 2) Self-Asserted: post the credentials.
  const selfAssertedUrl = new URL(`${LOGIN_BASE}/${POLICY}/SelfAsserted`);
  selfAssertedUrl.search = new URLSearchParams({
    tx: `StateProperties=${stateProperties}`,
    p: POLICY,
  }).toString();
  const selfAsserted = await fetch(selfAssertedUrl, {
    method: 'POST',
    headers: {
      'x-csrf-token': csrfToken,
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieHeader(),
    },
    body: new URLSearchParams({
      request_type: 'RESPONSE',
      signInName: email,
      password,
    }).toString(),
    redirect: 'manual',
  });
  const selfAssertedBody = await selfAsserted.text();
  console.error(`[login] self-asserted status=${selfAsserted.status} body=${selfAssertedBody}`);
  // The SelfAsserted POST sets the session cookies required by the confirm step.
  Object.assign(cookies, parseSetCookies(selfAsserted));

  // 3) Confirm -> 302 redirect to the app callback with ?code=...
  const confirmUrl = new URL(`${LOGIN_BASE}/${POLICY}/api/CombinedSigninAndSignup/confirmed`);
  confirmUrl.search = new URLSearchParams({
    rememberMe: 'false',
    csrf_token: csrfToken,
    tx: `StateProperties=${stateProperties}`,
    p: POLICY,
  }).toString();
  const confirm = await fetch(confirmUrl, {
    headers: { Cookie: cookieHeader() },
    redirect: 'manual',
  });
  const location = confirm.headers.get('location');
  console.error(`[login] confirm status=${confirm.status} location=${location}`);
  const code = new URL(location).searchParams.get('code');
  if (!code) {
    throw new Error('No authorization code returned');
  }

  // 4) Token exchange.
  const tokenResponse = await fetch(`${LOGIN_BASE}/oauth2/v2.0/token?p=${POLICY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
      client_id: CLIENT_ID,
    }).toString(),
  });
  const tokens = await tokenResponse.json();
  if (!tokens.access_token) {
    throw new Error(`Token exchange failed: ${JSON.stringify(tokens)}`);
  }
  console.error('[login] got access + refresh token');
  return tokens.access_token;
}

async function apiGet(accessToken, path) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
    },
  });
  const text = await response.text();
  console.error(`[api] GET ${path} -> ${response.status}`);
  if (!response.ok) {
    return { __error: response.status, body: text };
  }
  try {
    return JSON.parse(text);
  } catch {
    return { __raw: text };
  }
}

(async () => {
  const accessToken = await login();
  const dashboard = await apiGet(accessToken, '/homes/dashboard');
  // Dump the full dashboard so we can map every field precisely.
  console.log(JSON.stringify(dashboard, null, 2));
})().catch((err) => {
  console.error('PROBE FAILED:', err);
  process.exit(1);
});
