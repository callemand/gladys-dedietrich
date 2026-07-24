import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDhwFeatures,
  buildDhwPollStates,
  isDhwComfortSetpoint,
} from '../src/devices/hotWaterZone.js';
import { DHW_ZONE, APPLIANCE } from './fixtures.js';

function makeIds() {
  return {
    device: 'ext:test:dhw:w1',
    feature: (key) => `ext:test:dhw:w1:${key}`,
  };
}

test('buildDhwFeatures uses the comfort setpoint range from setPointRanges', () => {
  const features = buildDhwFeatures(makeIds(), DHW_ZONE);
  assert.deepEqual(
    features.map((f) => f.external_id),
    ['ext:test:dhw:w1:comfort-setpoint', 'ext:test:dhw:w1:water-temperature'],
  );

  const setpoint = features.find((f) => f.external_id.endsWith('comfort-setpoint'));
  assert.equal(setpoint.read_only, false);
  assert.equal(setpoint.min, 35);
  assert.equal(setpoint.max, 60);
  assert.equal(setpoint.category, 'thermostat');

  const water = features.find((f) => f.external_id.endsWith('water-temperature'));
  assert.equal(water.read_only, true);
  assert.equal(water.category, 'temperature-sensor');
});

test('buildDhwFeatures falls back to setPointMin/Max when setPointRanges is absent', () => {
  const features = buildDhwFeatures(makeIds(), { ...DHW_ZONE, setPointRanges: undefined });
  const setpoint = features.find((f) => f.external_id.endsWith('comfort-setpoint'));
  assert.equal(setpoint.min, 35);
  assert.equal(setpoint.max, 60);
});

test('buildDhwPollStates reports the comfort setpoint and water temperature', () => {
  const states = buildDhwPollStates(makeIds(), DHW_ZONE);
  assert.deepEqual(states, [
    { device_feature_external_id: 'ext:test:dhw:w1:comfort-setpoint', state: 50 },
    { device_feature_external_id: 'ext:test:dhw:w1:water-temperature', state: 54.6 },
  ]);
});

test('buildDhwFeatures adds the hot-water energy feature when the appliance supports it', () => {
  const features = buildDhwFeatures(makeIds(), DHW_ZONE, APPLIANCE);
  assert.deepEqual(
    features.map((f) => f.external_id.split(':').pop()),
    ['comfort-setpoint', 'water-temperature', 'hot-water-energy'],
  );
});

test('buildDhwPollStates includes the hot-water energy state', () => {
  const states = buildDhwPollStates(makeIds(), DHW_ZONE, { heating: 1551, hotWater: 664 });
  const byCode = Object.fromEntries(
    states.map((s) => [s.device_feature_external_id.split(':').pop(), s.state]),
  );
  assert.equal(byCode['comfort-setpoint'], 50);
  assert.equal(byCode['water-temperature'], 54.6);
  assert.equal(byCode['hot-water-energy'], 664);
});

test('isDhwComfortSetpoint recognizes only the comfort-setpoint feature', () => {
  assert.equal(isDhwComfortSetpoint('comfort-setpoint'), true);
  assert.equal(isDhwComfortSetpoint('water-temperature'), false);
});
