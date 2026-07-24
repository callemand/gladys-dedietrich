// -----------------------------------------------------------------------------
// Entry point of the Gladys De Dietrich external integration.
//
//   - logs in to the De Dietrich cloud (BDR Thermea) with the credentials
//     from the integration config;
//   - publishes the account's climate zones, hot-water zones and boiler sensors
//     as discovered devices;
//   - answers the polls of Gladys with the current states (from /homes/dashboard);
//   - forwards user commands (climate setpoint, DHW comfort setpoint).
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN, GLADYS_INTEGRATION_SELECTOR
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';

import { normalizeConfig } from './src/config.js';
import { DeDietrichClient } from './src/bdr/client.js';
import { CLIMATE_SLUG, DHW_SLUG } from './src/constants.js';
import {
  convertDashboard,
  climateExternalIds,
  dhwExternalIds,
  findClimateZone,
  findHotWaterZone,
  findAppliance,
  getApplianceId,
} from './src/devices/convertDevice.js';
import { buildClimatePollStates, isClimateSetpoint } from './src/devices/climateZone.js';
import { buildDhwPollStates, isDhwComfortSetpoint } from './src/devices/hotWaterZone.js';

const gladys = new GladysIntegration();
const dedietrich = new DeDietrichClient();

// Current configuration (hot-reloaded via onConfigUpdated).
let config = normalizeConfig();

/**
 * Split a device external id (`ext:<selector>:<slug>:<id>`) into its slug and id.
 * @returns {{ slug: string, id: string }}
 */
function parseExternalId(externalId) {
  const prefix = gladys.externalId('');
  if (!externalId || !externalId.startsWith(prefix)) {
    throw new Error(
      `De Dietrich device external_id is invalid: "${externalId}" should start with "${prefix}"`,
    );
  }
  const parts = externalId.slice(prefix.length).split(':');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `De Dietrich device external_id is invalid: "${externalId}" should be "${prefix}<slug>:<id>"`,
    );
  }
  return { slug: parts[0], id: parts[1] };
}

/**
 * Log in with the current config. Returns false (without throwing) when the
 * credentials are not filled in yet.
 */
async function connect() {
  if (!config.email || !config.password) {
    dedietrich.logout();
    logger.warn(
      'De Dietrich is not configured yet: fill in the email and password in the integration settings',
    );
    return false;
  }
  await dedietrich.login(config.email, config.password);
  return true;
}

/** Load the dashboard and publish its devices. */
async function publishDevices() {
  const dashboard = await dedietrich.getDashboard({ force: true });
  const devices = convertDashboard(gladys, dashboard);
  logger.info(`${devices.length} De Dietrich devices found`);
  await gladys.publishDiscoveredDevices(devices);
}

// --- Discovery ---------------------------------------------------------------
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> loading De Dietrich devices');
  if (!dedietrich.isLoggedIn() && !(await connect())) {
    throw new Error('De Dietrich is not configured');
  }
  await publishDevices();
});

// --- Command -----------------------------------------------------------------
gladys.onSetValue(async (device, feature, value) => {
  logger.info(`onSetValue <- ${feature.external_id} = ${value}`);
  const { slug, id } = parseExternalId(device.external_id);
  const featureCode = feature.external_id.split(':').pop();

  if (slug === CLIMATE_SLUG && isClimateSetpoint(featureCode)) {
    // The write endpoint depends on the zone's current mode, so read it first.
    const dashboard = await dedietrich.getDashboard();
    const zone = findClimateZone(dashboard, id);
    await dedietrich.setClimateSetpoint(id, value, zone && zone.zoneMode);
    return;
  }

  if (slug === DHW_SLUG && isDhwComfortSetpoint(featureCode)) {
    await dedietrich.setDhwComfortSetpoint(id, value);
    return;
  }

  throw new Error(`De Dietrich feature "${feature.external_id}" is not controllable`);
});

// --- Polling -----------------------------------------------------------------
gladys.onPoll(async (device) => {
  const { slug, id } = parseExternalId(device.external_id);
  const applianceId = getApplianceId(device);
  const dashboard = await dedietrich.getDashboard();
  const appliance = findAppliance(dashboard, applianceId) || {};
  const energy = appliance.capabilityEnergyConsumption
    ? await dedietrich.getEnergyConsumption(applianceId)
    : null;

  let states = [];
  if (slug === CLIMATE_SLUG) {
    const zone = findClimateZone(dashboard, id);
    if (zone) {
      states = buildClimatePollStates(climateExternalIds(gladys, id), zone, appliance, energy);
    }
  } else if (slug === DHW_SLUG) {
    const zone = findHotWaterZone(dashboard, id);
    if (zone) {
      states = buildDhwPollStates(dhwExternalIds(gladys, id), zone, energy);
    }
  }

  if (states.length > 0) {
    await gladys.publishStates(states);
  }
});

// --- Configuration updated ---------------------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> reconnecting to De Dietrich');
  config = normalizeConfig(newConfig);
  try {
    if (await connect()) {
      await publishDevices();
    }
  } catch (err) {
    logger.error('Reconnection to De Dietrich failed', err);
  }
});

// --- Connection lifecycle ----------------------------------------------------
gladys.on('connected', async () => {
  logger.info('WebSocket connected to Gladys');
  try {
    config = normalizeConfig(await gladys.getConfig());
    if (await connect()) {
      await publishDevices();
    }
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
  }
});

gladys.on('disconnected', () => {
  logger.warn('WebSocket disconnected - the SDK will try to reconnect');
});

// --- Graceful shutdown -------------------------------------------------------
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the De Dietrich integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
