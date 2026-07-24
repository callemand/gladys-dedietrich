// -----------------------------------------------------------------------------
// Appliance-level (boiler) sensors and energy, shared helpers.
//
// These do not form their own Gladys device: the outdoor temperature and water
// pressure are attached to the heating (climate) device, and the cumulative
// energy indexes are split between the heating and hot-water devices.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

import { FEATURE_CODES, OUTDOOR_TEMPERATURE_BOUNDS, WATER_PRESSURE_BOUNDS } from '../constants.js';
import { toNumber } from './helpers.js';

// Upper bound for the cumulative energy index features (kWh). Generous so a
// long-running meter is never clipped.
const ENERGY_INDEX_MAX = 10_000_000;

/**
 * Build a cumulative energy (kWh) meter-index feature.
 * @param {string} externalId feature external id
 * @param {string} name feature label
 * @returns {object} Gladys feature
 */
export function energyFeature(externalId, name) {
  return {
    name,
    external_id: externalId,
    read_only: true,
    keep_history: true,
    has_feedback: false,
    min: 0,
    max: ENERGY_INDEX_MAX,
    unit: DEVICE_FEATURE_UNITS.KILOWATT_HOUR,
    category: DEVICE_FEATURE_CATEGORIES.ENERGY_SENSOR,
    type: DEVICE_FEATURE_TYPES.ENERGY_SENSOR.INDEX,
  };
}

/**
 * Read the outdoor temperature, preferring the appliance sensor, then the
 * internet source, then the cloud estimate. Returns null when none is set.
 * @param {object} appliance appliance entry from the dashboard
 * @returns {number|null}
 */
export function getOutdoorTemperature(appliance) {
  const info = appliance.outdoorTemperatureInformation || {};
  return (
    toNumber(info.applianceOutdoorTemperature) ??
    toNumber(info.internetOutdoorTemperature) ??
    toNumber(info.cloudOutdoorTemperature)
  );
}

/**
 * Build the shared appliance-sensor features (outdoor temperature, water
 * pressure) to attach to the heating device.
 * @param {object} ids external ids of the Gladys device
 * @param {object} appliance appliance entry from the dashboard
 * @returns {Array} Gladys features (may be empty)
 */
export function buildSharedSensorFeatures(ids, appliance) {
  const features = [];
  if (appliance.capabilityOutdoorTemperature) {
    features.push({
      name: 'Outdoor temperature',
      external_id: ids.feature(FEATURE_CODES.OUTDOOR_TEMPERATURE),
      read_only: true,
      keep_history: true,
      has_feedback: false,
      min: OUTDOOR_TEMPERATURE_BOUNDS.MIN,
      max: OUTDOOR_TEMPERATURE_BOUNDS.MAX,
      unit: DEVICE_FEATURE_UNITS.CELSIUS,
      category: DEVICE_FEATURE_CATEGORIES.TEMPERATURE_SENSOR,
      type: DEVICE_FEATURE_TYPES.SENSOR.DECIMAL,
    });
  }
  if (toNumber(appliance.waterPressure) !== null) {
    features.push({
      name: 'Water pressure',
      external_id: ids.feature(FEATURE_CODES.WATER_PRESSURE),
      read_only: true,
      keep_history: true,
      has_feedback: false,
      min: WATER_PRESSURE_BOUNDS.MIN,
      max: WATER_PRESSURE_BOUNDS.MAX,
      unit: DEVICE_FEATURE_UNITS.BAR,
      category: DEVICE_FEATURE_CATEGORIES.PRESSURE_SENSOR,
      type: DEVICE_FEATURE_TYPES.SENSOR.DECIMAL,
    });
  }
  return features;
}

/**
 * Build the shared appliance-sensor states (outdoor temperature, water
 * pressure).
 * @param {object} ids external ids of the Gladys device
 * @param {object} appliance appliance entry from the dashboard
 * @returns {Array} states for gladys.publishStates()
 */
export function buildSharedSensorStates(ids, appliance) {
  return [
    {
      device_feature_external_id: ids.feature(FEATURE_CODES.OUTDOOR_TEMPERATURE),
      state: appliance.capabilityOutdoorTemperature ? getOutdoorTemperature(appliance) : null,
    },
    {
      device_feature_external_id: ids.feature(FEATURE_CODES.WATER_PRESSURE),
      state: toNumber(appliance.waterPressure),
    },
  ].filter((s) => s.state !== null && s.state !== undefined);
}
