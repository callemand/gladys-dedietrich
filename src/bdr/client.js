// -----------------------------------------------------------------------------
// BDR Thermea mobile API client (De Dietrich).
//
//   - login()                        -> B2C OAuth2 flow (see auth.js)
//   - getDashboard()                 -> GET /homes/dashboard (cached a few s)
//   - setClimateSetpoint(...)        -> POST /climate-zones/{id}/modes/...
//   - setDhwComfortSetpoint(...)     -> POST /hot-water-zones/{id}/comfort-setpoint
//
// Every API request carries the bearer access token and the Azure APIM
// subscription key. On a 401 the access token is refreshed once (falling back
// to a full login) and the request retried.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

import {
  API_BASE,
  API_SUBSCRIPTION_KEY,
  DASHBOARD_CACHE_TTL_MS,
  ENERGY_CACHE_TTL_MS,
  ENERGY_RANGE,
} from '../constants.js';
import { login as b2cLogin, refresh as b2cRefresh } from './auth.js';

const logger = createLogger({ name: 'dedietrich' });

const REQUEST_TIMEOUT_MS = 15000;

export class DeDietrichClient {
  /**
   * @param {object} [options]
   * @param {typeof fetch} [options.fetchImpl] fetch implementation (for tests)
   */
  constructor({ fetchImpl = fetch } = {}) {
    this.fetchImpl = fetchImpl;
    this.accessToken = null;
    this.refreshToken = null;
    this.credentials = null;
    this._dashboard = null;
    this._dashboardAt = 0;
    this._energy = new Map(); // applianceId -> { value, at }
  }

  isLoggedIn() {
    return this.accessToken !== null;
  }

  /**
   * Log in and store the tokens.
   * @param {string} email
   * @param {string} password
   */
  async login(email, password) {
    this.logout();
    this.credentials = { email, password };
    logger.debug('Logging in to the De Dietrich cloud...');
    const tokens = await b2cLogin(email, password, this.fetchImpl);
    this.#storeTokens(tokens);
    logger.info('Logged in to the De Dietrich cloud');
  }

  logout() {
    this.accessToken = null;
    this.refreshToken = null;
    this.credentials = null;
    this._dashboard = null;
    this._dashboardAt = 0;
    this._energy = new Map();
  }

  /**
   * Fetch the account dashboard (all appliances + zones). Cached for a few
   * seconds to collapse the per-device poll burst into one upstream request.
   * @param {object} [options]
   * @param {boolean} [options.force] bypass the cache
   * @returns {Promise<object>} the dashboard payload
   */
  async getDashboard({ force = false } = {}) {
    const age = Date.now() - this._dashboardAt;
    if (!force && this._dashboard && age < DASHBOARD_CACHE_TTL_MS) {
      return this._dashboard;
    }
    const dashboard = await this.#authenticatedRequest('/homes/dashboard');
    this._dashboard = dashboard;
    this._dashboardAt = Date.now();
    return dashboard;
  }

  /**
   * All-time cumulative energy consumption of an appliance, summed from the
   * yearly buckets. Cached per appliance for ENERGY_CACHE_TTL_MS.
   * @param {string} applianceId
   * @param {object} [options]
   * @param {boolean} [options.force] bypass the cache
   * @returns {Promise<{ heating: number, hotWater: number, cooling: number }>}
   */
  async getEnergyConsumption(applianceId, { force = false } = {}) {
    const cached = this._energy.get(applianceId);
    if (!force && cached && Date.now() - cached.at < ENERGY_CACHE_TTL_MS) {
      return cached.value;
    }
    const query = new URLSearchParams({ startDate: ENERGY_RANGE.START, endDate: ENERGY_RANGE.END });
    const response = await this.#authenticatedRequest(
      `/appliances/${applianceId}/energyconsumption/yearly?${query}`,
    );
    const value = { heating: 0, hotWater: 0, cooling: 0 };
    for (const bucket of response.data || []) {
      value.heating += Number(bucket.heatingEnergyConsumed) || 0;
      value.hotWater += Number(bucket.hotWaterEnergyConsumed) || 0;
      value.cooling += Number(bucket.coolingEnergyConsumed) || 0;
    }
    this._energy.set(applianceId, { value, at: Date.now() });
    return value;
  }

  /**
   * Set the target temperature of a climate zone. When the zone follows its
   * schedule the change is a temporary override (kept until the next scheduled
   * switch, like the app); otherwise the zone is switched to manual mode.
   * @param {string} climateZoneId
   * @param {number} temperature target temperature in Celsius
   * @param {string} currentMode current zoneMode (from the dashboard)
   */
  async setClimateSetpoint(climateZoneId, temperature, currentMode) {
    const roomTemperatureSetPoint = Number(temperature);
    const endpoint =
      currentMode === 'Scheduling'
        ? `/climate-zones/${climateZoneId}/modes/temporary-override`
        : `/climate-zones/${climateZoneId}/modes/manual`;
    await this.#authenticatedRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify({ roomTemperatureSetPoint }),
    });
    this.#invalidateDashboard();
  }

  /**
   * Set the comfort setpoint of a hot-water (DHW) zone.
   * @param {string} hotWaterZoneId
   * @param {number} temperature comfort setpoint in Celsius
   */
  async setDhwComfortSetpoint(hotWaterZoneId, temperature) {
    await this.#authenticatedRequest(`/hot-water-zones/${hotWaterZoneId}/comfort-setpoint`, {
      method: 'POST',
      body: JSON.stringify({ comfortSetpoint: Number(temperature) }),
    });
    this.#invalidateDashboard();
  }

  #invalidateDashboard() {
    this._dashboard = null;
    this._dashboardAt = 0;
  }

  async #authenticatedRequest(path, options = {}) {
    if (!this.isLoggedIn()) {
      throw new Error('De Dietrich is not connected');
    }
    const doRequest = () =>
      this.#fetchJson(path, {
        ...options,
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
    try {
      return await doRequest();
    } catch (e) {
      if (e.status === 401 && this.credentials) {
        logger.warn('Session expired, refreshing the token...');
        await this.#reauthenticate();
        return doRequest();
      }
      throw e;
    }
  }

  async #reauthenticate() {
    try {
      const tokens = await b2cRefresh(this.refreshToken, this.fetchImpl);
      this.#storeTokens(tokens);
    } catch {
      logger.warn('Token refresh failed, logging in again...');
      await this.login(this.credentials.email, this.credentials.password);
    }
  }

  #storeTokens(tokens) {
    if (!tokens || !tokens.accessToken) {
      throw new Error('De Dietrich login failed: no access token returned');
    }
    this.accessToken = tokens.accessToken;
    if (tokens.refreshToken) {
      this.refreshToken = tokens.refreshToken;
    }
  }

  async #fetchJson(path, { method = 'GET', headers = {}, body }) {
    const response = await this.fetchImpl(`${API_BASE}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        'Ocp-Apim-Subscription-Key': API_SUBSCRIPTION_KEY,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      const error = new Error(
        `De Dietrich request failed: ${method} ${path} -> HTTP ${response.status}`,
      );
      error.status = response.status;
      throw error;
    }
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  }
}
