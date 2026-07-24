// -----------------------------------------------------------------------------
// Convert a De Dietrich dashboard (/homes/dashboard) into Gladys
// discovered devices.
//
// One appliance (boiler) yields two kinds of Gladys devices:
//   - one heating device per climate zone (CH)   slug `climate`, id = climateZoneId
//   - one hot-water device per DHW zone          slug `dhw`,     id = hotWaterZoneId
//
// The appliance-level sensors (outdoor temperature, water pressure) and the
// heating energy live on the heating device; the hot-water energy lives on the
// hot-water device. There is no separate boiler device.
//
// External id scheme (built with gladys.externalIds(), prefix `ext:<selector>:`):
//   device  -> ext:<selector>:<slug>:<id>
//   feature -> ext:<selector>:<slug>:<id>:<featureCode>
//
// The parent applianceId is stored as a device param so poll/set-value can
// locate the zone and its appliance in the dashboard.
// -----------------------------------------------------------------------------

import { POLL_FREQUENCY, CLIMATE_SLUG, DHW_SLUG, APPLIANCE_ID_PARAM } from '../constants.js';
import { buildClimateFeatures } from './climateZone.js';
import { buildDhwFeatures } from './hotWaterZone.js';

export function climateExternalIds(gladys, zoneId) {
  return gladys.externalIds(CLIMATE_SLUG, String(zoneId));
}

export function dhwExternalIds(gladys, zoneId) {
  return gladys.externalIds(DHW_SLUG, String(zoneId));
}

function baseDevice(appliance) {
  return {
    model: appliance.applianceType || null,
    poll_frequency: POLL_FREQUENCY,
    should_poll: true,
    params: [{ name: APPLIANCE_ID_PARAM, value: String(appliance.applianceId) }],
  };
}

/**
 * Derive a globally-unique selector from an external id. Gladys generates a
 * device-feature selector from `slugify(feature.selector || feature.name)`, and
 * that selector is unique across the WHOLE account — so two integrations both
 * naming a feature "Room temperature" would collide on the `room-temperature`
 * selector. We therefore seed an explicit selector from the (globally-unique)
 * external id, dropping the redundant `ext:` prefix for readability.
 * @param {string} externalId
 * @returns {string}
 */
function selectorFromExternalId(externalId) {
  return externalId.replace(/^ext:/, '');
}

/**
 * Attach explicit, collision-proof selectors to a device and its features.
 * @param {object} device Gladys discovered device
 * @returns {object} the device with selectors set
 */
function withSelectors(device) {
  return {
    ...device,
    selector: selectorFromExternalId(device.external_id),
    features: device.features.map((feature) => ({
      ...feature,
      selector: selectorFromExternalId(feature.external_id),
    })),
  };
}

function climateZoneName(zone) {
  const name = (zone.name || '').trim();
  return name && name !== '0' ? `Chauffage ${name}` : 'Chauffage';
}

/**
 * Convert one appliance into its Gladys devices.
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {object} appliance appliance entry from the dashboard
 * @returns {Array} Gladys discovered devices
 */
export function convertAppliance(gladys, appliance) {
  const devices = [];

  (appliance.climateZones || []).forEach((zone) => {
    const ids = climateExternalIds(gladys, zone.climateZoneId);
    devices.push(
      withSelectors({
        ...baseDevice(appliance),
        name: climateZoneName(zone),
        external_id: ids.device,
        features: buildClimateFeatures(ids, zone, appliance),
      }),
    );
  });

  (appliance.hotWaterZones || []).forEach((zone) => {
    const ids = dhwExternalIds(gladys, zone.hotWaterZoneId);
    devices.push(
      withSelectors({
        ...baseDevice(appliance),
        name: 'Eau chaude sanitaire',
        external_id: ids.device,
        features: buildDhwFeatures(ids, zone, appliance),
      }),
    );
  });

  return devices;
}

/**
 * Convert the whole dashboard into Gladys devices.
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {object} dashboard the /homes/dashboard payload
 * @returns {Array} Gladys discovered devices
 */
export function convertDashboard(gladys, dashboard) {
  return (dashboard.appliances || []).flatMap((appliance) => convertAppliance(gladys, appliance));
}

/**
 * Read the applianceId stored in a Gladys device's params.
 * @param {object} device Gladys device (as sent with poll/set-value commands)
 * @returns {string} the applianceId
 */
export function getApplianceId(device) {
  const param = (device.params || []).find(({ name }) => name === APPLIANCE_ID_PARAM);
  if (!param) {
    throw new Error(
      `De Dietrich device "${device.external_id}" has no "${APPLIANCE_ID_PARAM}" param`,
    );
  }
  return param.value;
}

/**
 * Find a climate zone by id anywhere in the dashboard.
 * @returns {object|undefined}
 */
export function findClimateZone(dashboard, zoneId) {
  for (const appliance of dashboard.appliances || []) {
    const zone = (appliance.climateZones || []).find(
      (z) => String(z.climateZoneId) === String(zoneId),
    );
    if (zone) {
      return zone;
    }
  }
  return undefined;
}

/**
 * Find a hot-water zone by id anywhere in the dashboard.
 * @returns {object|undefined}
 */
export function findHotWaterZone(dashboard, zoneId) {
  for (const appliance of dashboard.appliances || []) {
    const zone = (appliance.hotWaterZones || []).find(
      (z) => String(z.hotWaterZoneId) === String(zoneId),
    );
    if (zone) {
      return zone;
    }
  }
  return undefined;
}

/**
 * Find an appliance by id in the dashboard.
 * @returns {object|undefined}
 */
export function findAppliance(dashboard, applianceId) {
  return (dashboard.appliances || []).find((a) => String(a.applianceId) === String(applianceId));
}
