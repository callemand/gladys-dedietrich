// -----------------------------------------------------------------------------
// Climate zone (zoneType "CH") -> Gladys heating device.
//
// Exposes:
//   - target-temperature  (thermostat / target-temperature, writable)
//   - room-temperature    (temperature-sensor / decimal, read-only)
//   - outdoor-temperature (appliance-level, read-only)     when supported
//   - water-pressure      (appliance-level, read-only)     when reported
//   - heating-energy      (energy-sensor / index, kWh)      when supported
//
// The appliance-level sensors and the heating energy live on this device (there
// is no separate boiler device).
//
// Setting the target temperature is a temporary override when the zone follows
// its schedule, and a manual-mode change otherwise (see client.setClimateSetpoint).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

import { FEATURE_CODES, DEFAULT_CH_BOUNDS } from '../constants.js';
import { toNumber } from './helpers.js';
import {
  buildSharedSensorFeatures,
  buildSharedSensorStates,
  energyFeature,
} from './applianceSensors.js';

/**
 * @param {object} ids external ids of the Gladys device: `{ device, feature(key) }`
 * @param {object} zone climate zone entry from the dashboard
 * @param {object} appliance parent appliance (for shared sensors + energy capability)
 * @returns {Array} Gladys device features
 */
export function buildClimateFeatures(ids, zone, appliance = {}) {
  const min = toNumber(zone.setPointMin) ?? DEFAULT_CH_BOUNDS.MIN;
  const max = toNumber(zone.setPointMax) ?? DEFAULT_CH_BOUNDS.MAX;
  const features = [
    {
      name: 'Target temperature',
      external_id: ids.feature(FEATURE_CODES.TARGET_TEMPERATURE),
      read_only: false,
      has_feedback: true,
      min,
      max,
      unit: DEVICE_FEATURE_UNITS.CELSIUS,
      category: DEVICE_FEATURE_CATEGORIES.THERMOSTAT,
      type: DEVICE_FEATURE_TYPES.THERMOSTAT.TARGET_TEMPERATURE,
    },
    {
      name: 'Room temperature',
      external_id: ids.feature(FEATURE_CODES.ROOM_TEMPERATURE),
      read_only: true,
      keep_history: true,
      has_feedback: false,
      min: -10,
      max: 50,
      unit: DEVICE_FEATURE_UNITS.CELSIUS,
      category: DEVICE_FEATURE_CATEGORIES.TEMPERATURE_SENSOR,
      type: DEVICE_FEATURE_TYPES.SENSOR.DECIMAL,
    },
    ...buildSharedSensorFeatures(ids, appliance),
  ];
  if (appliance.capabilityEnergyConsumption) {
    features.push(energyFeature(ids.feature(FEATURE_CODES.HEATING_ENERGY), 'Heating energy'));
  }
  return features;
}

/**
 * @param {object} ids external ids of the Gladys device
 * @param {object} zone climate zone entry from the dashboard
 * @param {object} appliance parent appliance (for shared sensors)
 * @param {{ heating: number }|null} [energy] cumulative energy (from client.getEnergyConsumption)
 * @returns {Array} states for gladys.publishStates()
 */
export function buildClimatePollStates(ids, zone, appliance = {}, energy = null) {
  const states = [
    {
      device_feature_external_id: ids.feature(FEATURE_CODES.TARGET_TEMPERATURE),
      state: toNumber(zone.setPoint),
    },
    {
      device_feature_external_id: ids.feature(FEATURE_CODES.ROOM_TEMPERATURE),
      state: toNumber(zone.roomTemperature),
    },
    ...buildSharedSensorStates(ids, appliance),
  ];
  if (energy) {
    states.push({
      device_feature_external_id: ids.feature(FEATURE_CODES.HEATING_ENERGY),
      state: toNumber(energy.heating),
    });
  }
  return states.filter((s) => s.state !== null && s.state !== undefined);
}

/**
 * Whether a feature code is the controllable climate setpoint.
 * @param {string} featureCode
 * @returns {boolean}
 */
export function isClimateSetpoint(featureCode) {
  return featureCode === FEATURE_CODES.TARGET_TEMPERATURE;
}
