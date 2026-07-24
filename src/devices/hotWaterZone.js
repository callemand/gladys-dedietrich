// -----------------------------------------------------------------------------
// Hot water zone (zoneType "DHW") -> Gladys thermostat.
//
// Exposes two features:
//   - comfort-setpoint (thermostat / target-temperature, writable)
//   - water-temperature (temperature-sensor / decimal, read-only)
//
// The comfort setpoint range comes from setPointRanges (comfortSetpointMin/Max)
// when present, falling back to the zone-level setPointMin/Max.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

import { FEATURE_CODES, DEFAULT_DHW_BOUNDS } from '../constants.js';
import { toNumber } from './helpers.js';
import { energyFeature } from './applianceSensors.js';

function comfortBounds(zone) {
  const ranges = zone.setPointRanges || {};
  const min = toNumber(ranges.comfortSetpointMin) ?? toNumber(zone.setPointMin);
  const max = toNumber(ranges.comfortSetpointMax) ?? toNumber(zone.setPointMax);
  return {
    min: min ?? DEFAULT_DHW_BOUNDS.MIN,
    max: max ?? DEFAULT_DHW_BOUNDS.MAX,
  };
}

/**
 * @param {object} ids external ids of the Gladys device
 * @param {object} zone hot water zone entry from the dashboard
 * @param {object} appliance parent appliance (for energy capability)
 * @returns {Array} Gladys device features
 */
export function buildDhwFeatures(ids, zone, appliance = {}) {
  const { min, max } = comfortBounds(zone);
  const features = [
    {
      name: 'Comfort setpoint',
      external_id: ids.feature(FEATURE_CODES.DHW_COMFORT_SETPOINT),
      read_only: false,
      has_feedback: true,
      min,
      max,
      unit: DEVICE_FEATURE_UNITS.CELSIUS,
      category: DEVICE_FEATURE_CATEGORIES.THERMOSTAT,
      type: DEVICE_FEATURE_TYPES.THERMOSTAT.TARGET_TEMPERATURE,
    },
    {
      name: 'Water temperature',
      external_id: ids.feature(FEATURE_CODES.DHW_TEMPERATURE),
      read_only: true,
      keep_history: true,
      has_feedback: false,
      min: 0,
      max: 90,
      unit: DEVICE_FEATURE_UNITS.CELSIUS,
      category: DEVICE_FEATURE_CATEGORIES.TEMPERATURE_SENSOR,
      type: DEVICE_FEATURE_TYPES.SENSOR.DECIMAL,
    },
  ];
  if (appliance.capabilityEnergyConsumption) {
    features.push(energyFeature(ids.feature(FEATURE_CODES.HOT_WATER_ENERGY), 'Hot water energy'));
  }
  return features;
}

/**
 * @param {object} ids external ids of the Gladys device
 * @param {object} zone hot water zone entry from the dashboard
 * @param {{ hotWater: number }|null} [energy] cumulative energy (from client.getEnergyConsumption)
 * @returns {Array} states for gladys.publishStates()
 */
export function buildDhwPollStates(ids, zone, energy = null) {
  const states = [
    {
      device_feature_external_id: ids.feature(FEATURE_CODES.DHW_COMFORT_SETPOINT),
      state: toNumber(zone.comfortSetPoint),
    },
    {
      device_feature_external_id: ids.feature(FEATURE_CODES.DHW_TEMPERATURE),
      state: toNumber(zone.dhwTemperature),
    },
  ];
  if (energy) {
    states.push({
      device_feature_external_id: ids.feature(FEATURE_CODES.HOT_WATER_ENERGY),
      state: toNumber(energy.hotWater),
    });
  }
  return states.filter((s) => s.state !== null && s.state !== undefined);
}

/**
 * Whether a feature code is the controllable DHW comfort setpoint.
 * @param {string} featureCode
 * @returns {boolean}
 */
export function isDhwComfortSetpoint(featureCode) {
  return featureCode === FEATURE_CODES.DHW_COMFORT_SETPOINT;
}
