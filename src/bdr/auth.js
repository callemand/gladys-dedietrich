// -----------------------------------------------------------------------------
// Azure AD B2C OAuth2 login flow for the BDR Thermea cloud (De Dietrich).
//
// The mobile app uses an OAuth2 authorization-code + PKCE flow against a B2C
// custom policy. There is no username/password token endpoint, so the flow is
// replayed step by step:
//   1. GET  /authorize                       -> CSRF cookie + request id
//   2. POST /SelfAsserted                     -> submit email + password
//   3. GET  /CombinedSigninAndSignup/confirmed-> 302 redirect with ?code=
//   4. POST /token                            -> exchange code for tokens
// A refresh_token grant against the same /token endpoint renews the session.
//
// This module is transport-only: it takes a `fetchImpl` (defaults to global
// fetch) so it can be unit-tested against a fake B2C server.
// -----------------------------------------------------------------------------

import crypto from 'node:crypto';

import {
  LOGIN_BASE,
  B2C_POLICY,
  OAUTH_CLIENT_ID,
  OAUTH_REDIRECT_URI,
  OAUTH_SCOPE,
  OAUTH_BRAND,
} from '../constants.js';

const REQUEST_TIMEOUT_MS = 15000;

function base64UrlNoPad(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Parse the Set-Cookie header(s) of a response into a { name: value } map.
 * @param {Response} response
 * @returns {Record<string, string>}
 */
function parseSetCookies(response) {
  const jar = {};
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

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

/**
 * Run the full B2C login flow and return the OAuth tokens.
 * @param {string} email account email
 * @param {string} password account password
 * @param {typeof fetch} [fetchImpl] fetch implementation (for tests)
 * @returns {Promise<{ accessToken: string, refreshToken: string, expiresIn: number }>}
 */
export async function login(email, password, fetchImpl = fetch) {
  const codeVerifier = base64UrlNoPad(crypto.randomBytes(64));
  const codeChallenge = base64UrlNoPad(crypto.createHash('sha256').update(codeVerifier).digest());
  const state = base64UrlNoPad(crypto.randomBytes(32));

  // 1) Authorization request: yields the CSRF cookie and the x-request-id used
  //    to build the transaction id (StateProperties).
  const authorizeUrl = new URL(`${LOGIN_BASE}/oauth2/v2.0/authorize`);
  authorizeUrl.search = new URLSearchParams({
    response_type: 'code',
    client_id: OAUTH_CLIENT_ID,
    redirect_uri: OAUTH_REDIRECT_URI,
    scope: OAUTH_SCOPE,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    p: B2C_POLICY,
    brand: OAUTH_BRAND,
    lang: 'en',
    nonce: 'defaultNonce',
    prompt: 'login',
    signUp: 'False',
  }).toString();

  const authorizeResponse = await fetchImpl(authorizeUrl, {
    redirect: 'manual',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const requestId = authorizeResponse.headers.get('x-request-id');
  const cookies = parseSetCookies(authorizeResponse);
  const csrfToken = cookies['x-ms-cpim-csrf'];
  if (!csrfToken || !requestId) {
    throw new Error('De Dietrich login failed: could not start the authorization flow');
  }
  const stateProperties = base64UrlNoPad(Buffer.from(JSON.stringify({ TID: requestId })));

  // 2) Self-Asserted: submit the credentials. The response sets the session
  //    cookies required by the confirm step.
  const selfAssertedUrl = new URL(`${LOGIN_BASE}/${B2C_POLICY}/SelfAsserted`);
  selfAssertedUrl.search = new URLSearchParams({
    tx: `StateProperties=${stateProperties}`,
    p: B2C_POLICY,
  }).toString();
  const selfAsserted = await fetchImpl(selfAssertedUrl, {
    method: 'POST',
    headers: {
      'x-csrf-token': csrfToken,
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieHeader(cookies),
    },
    body: new URLSearchParams({ request_type: 'RESPONSE', signInName: email, password }).toString(),
    redirect: 'manual',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const selfAssertedText = await selfAsserted.text();
  let selfAssertedJson = {};
  try {
    selfAssertedJson = JSON.parse(selfAssertedText);
  } catch {
    // Non-JSON body means the credentials step was rejected outright.
  }
  if (selfAssertedJson.status !== '200') {
    throw new Error('De Dietrich login failed: check your email and password');
  }
  Object.assign(cookies, parseSetCookies(selfAsserted));

  // 3) Confirm: a 302 redirect to the app callback carrying the auth code.
  const confirmUrl = new URL(`${LOGIN_BASE}/${B2C_POLICY}/api/CombinedSigninAndSignup/confirmed`);
  confirmUrl.search = new URLSearchParams({
    rememberMe: 'false',
    csrf_token: csrfToken,
    tx: `StateProperties=${stateProperties}`,
    p: B2C_POLICY,
  }).toString();
  const confirm = await fetchImpl(confirmUrl, {
    headers: { Cookie: cookieHeader(cookies) },
    redirect: 'manual',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const location = confirm.headers.get('location');
  const code = location ? new URL(location).searchParams.get('code') : null;
  if (!code) {
    throw new Error('De Dietrich login failed: no authorization code returned');
  }

  // 4) Token exchange.
  return exchangeToken(fetchImpl, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: OAUTH_REDIRECT_URI,
    code_verifier: codeVerifier,
    client_id: OAUTH_CLIENT_ID,
  });
}

/**
 * Renew the session with a refresh token.
 * @param {string} refreshToken
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ accessToken: string, refreshToken: string, expiresIn: number }>}
 */
export async function refresh(refreshToken, fetchImpl = fetch) {
  return exchangeToken(fetchImpl, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: OAUTH_CLIENT_ID,
  });
}

async function exchangeToken(fetchImpl, params) {
  const response = await fetchImpl(`${LOGIN_BASE}/oauth2/v2.0/token?p=${B2C_POLICY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    // handled below
  }
  if (!response.ok || !json.access_token) {
    const error = new Error(
      `De Dietrich token exchange failed (${params.grant_type}): HTTP ${response.status}`,
    );
    error.status = response.status;
    throw error;
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token || refreshTokenFallback(params),
    expiresIn: Number(json.expires_in) || 3600,
  };
}

// On a refresh_token grant the backend may omit a new refresh_token; keep the
// previous one in that case.
function refreshTokenFallback(params) {
  return params.refresh_token || null;
}
