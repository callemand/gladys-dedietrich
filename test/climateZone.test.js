import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildClimateFeatures,
  buildClimatePollStates,
  isClimateSetpoint,
} from '../src/devices/climateZone.js';
import { CLIMATE_ZONE, APPLIANCE } from './fixtures.js';

function makeIds() {
  return {
    device: 'ext:test:climate:z1',
    feature: (key) => `ext:test:climate:z1:${key}`,
  };
}

test('buildClimateFeatures exposes a writable setpoint and a read-only room temperature', () => {
  const features = buildClimateFeatures(makeIds(), CLIMATE_ZONE);
  assert.deepEqual(
    features.map((f) => f.external_id),
    ['ext:test:climate:z1:target-temperature', 'ext:test:climate:z1:room-temperature'],
  );

  const setpoint = features.find((f) => f.external_id.endsWith('target-temperature'));
  assert.equal(setpoint.read_only, false);
  assert.equal(setpoint.has_feedback, true);
  assert.equal(setpoint.min, 5);
  assert.equal(setpoint.max, 30);
  assert.equal(setpoint.category, 'thermostat');
  assert.equal(setpoint.type, 'target-temperature');

  const room = features.find((f) => f.external_id.endsWith('room-temperature'));
  assert.equal(room.read_only, true);
  assert.equal(room.category, 'temperature-sensor');
});

test('buildClimateFeatures falls back to default bounds when the zone reports none', () => {
  const features = buildClimateFeatures(makeIds(), {
    ...CLIMATE_ZONE,
    setPointMin: undefined,
    setPointMax: undefined,
  });
  const setpoint = features.find((f) => f.external_id.endsWith('target-temperature'));
  assert.equal(setpoint.min, 5);
  assert.equal(setpoint.max, 30);
});

test('buildClimatePollStates reports the setpoint and room temperature', () => {
  const states = buildClimatePollStates(makeIds(), CLIMATE_ZONE);
  assert.deepEqual(states, [
    { device_feature_external_id: 'ext:test:climate:z1:target-temperature', state: 19 },
    { device_feature_external_id: 'ext:test:climate:z1:room-temperature', state: 26.5 },
  ]);
});

test('buildClimatePollStates skips missing values', () => {
  const states = buildClimatePollStates(makeIds(), { ...CLIMATE_ZONE, roomTemperature: null });
  assert.deepEqual(
    states.map((s) => s.device_feature_external_id),
    ['ext:test:climate:z1:target-temperature'],
  );
});

test('buildClimateFeatures attaches the shared sensors and heating energy from the appliance', () => {
  const features = buildClimateFeatures(makeIds(), CLIMATE_ZONE, APPLIANCE);
  assert.deepEqual(
    features.map((f) => f.external_id.split(':').pop()),
    [
      'target-temperature',
      'room-temperature',
      'outdoor-temperature',
      'water-pressure',
      'heating-energy',
    ],
  );
  const energy = features.find((f) => f.external_id.endsWith('heating-energy'));
  assert.equal(energy.unit, 'kilowatt-hour');
  assert.equal(energy.type, 'index');
});

test('buildClimatePollStates includes shared sensors and heating energy', () => {
  const states = buildClimatePollStates(makeIds(), CLIMATE_ZONE, APPLIANCE, {
    heating: 1551,
    hotWater: 664,
  });
  const byCode = Object.fromEntries(
    states.map((s) => [s.device_feature_external_id.split(':').pop(), s.state]),
  );
  assert.equal(byCode['target-temperature'], 19);
  assert.equal(byCode['room-temperature'], 26.5);
  assert.equal(byCode['outdoor-temperature'], 29);
  assert.equal(byCode['water-pressure'], 1.9);
  assert.equal(byCode['heating-energy'], 1551);
});

test('isClimateSetpoint recognizes only the target-temperature feature', () => {
  assert.equal(isClimateSetpoint('target-temperature'), true);
  assert.equal(isClimateSetpoint('room-temperature'), false);
});
