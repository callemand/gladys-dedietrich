import test from 'node:test';
import assert from 'node:assert/strict';

import {
  convertDashboard,
  getApplianceId,
  findClimateZone,
  findHotWaterZone,
  findAppliance,
} from '../src/devices/convertDevice.js';
import { DASHBOARD, APPLIANCE_ID, CLIMATE_ZONE_ID, DHW_ZONE_ID } from './fixtures.js';

const gladys = {
  externalIds: (slug, id) => ({
    device: `ext:test:${slug}:${id}`,
    feature: (key) => `ext:test:${slug}:${id}:${key}`,
  }),
};

test('convertDashboard yields exactly one heating and one hot-water device', () => {
  const devices = convertDashboard(gladys, DASHBOARD);
  assert.deepEqual(
    devices.map((d) => d.external_id),
    [`ext:test:climate:${CLIMATE_ZONE_ID}`, `ext:test:dhw:${DHW_ZONE_ID}`],
  );

  const climate = devices.find((d) => d.external_id.startsWith('ext:test:climate:'));
  assert.equal(climate.name, 'Chauffage');
  assert.equal(climate.should_poll, true);
  assert.equal(climate.poll_frequency, 60000);
  assert.equal(climate.model, 'Boiler');
  assert.deepEqual(climate.params, [{ name: 'applianceId', value: APPLIANCE_ID }]);
  // Heating device carries the shared sensors + heating energy.
  assert.deepEqual(
    climate.features.map((f) => f.external_id.split(':').pop()),
    [
      'target-temperature',
      'room-temperature',
      'outdoor-temperature',
      'water-pressure',
      'heating-energy',
    ],
  );

  const dhw = devices.find((d) => d.external_id.startsWith('ext:test:dhw:'));
  assert.equal(dhw.name, 'Eau chaude sanitaire');
  assert.deepEqual(
    dhw.features.map((f) => f.external_id.split(':').pop()),
    ['comfort-setpoint', 'water-temperature', 'hot-water-energy'],
  );
});

test('every device and feature gets a unique, external-id-derived selector', () => {
  const devices = convertDashboard(gladys, DASHBOARD);
  const selectors = [];
  for (const device of devices) {
    assert.ok(device.selector, `device ${device.external_id} has a selector`);
    // Selector is derived from the external id (minus the ext: prefix), never
    // from the generic name, so it cannot collide with another integration.
    assert.equal(device.selector, device.external_id.replace(/^ext:/, ''));
    selectors.push(device.selector);
    for (const feature of device.features) {
      assert.equal(feature.selector, feature.external_id.replace(/^ext:/, ''));
      selectors.push(feature.selector);
    }
  }
  // No duplicate selector anywhere.
  assert.equal(new Set(selectors).size, selectors.length);
  // In particular the room temperature is namespaced, not the bare "room-temperature".
  const roomTemp = devices
    .flatMap((d) => d.features)
    .find((f) => f.external_id.endsWith(':room-temperature'));
  assert.notEqual(roomTemp.selector, 'room-temperature');
});

test('no boiler device is created', () => {
  const devices = convertDashboard(gladys, DASHBOARD);
  assert.equal(
    devices.some((d) => d.external_id.startsWith('ext:test:boiler:')),
    false,
  );
});

test('a named climate zone keeps its label', () => {
  const dashboard = {
    appliances: [
      {
        ...DASHBOARD.appliances[0],
        climateZones: [{ ...DASHBOARD.appliances[0].climateZones[0], name: 'Salon' }],
      },
    ],
  };
  const climate = convertDashboard(gladys, dashboard).find((d) =>
    d.external_id.startsWith('ext:test:climate:'),
  );
  assert.equal(climate.name, 'Chauffage Salon');
});

test('energy and shared sensors drop out when the appliance does not report them', () => {
  const dashboard = {
    appliances: [
      {
        ...DASHBOARD.appliances[0],
        capabilityOutdoorTemperature: false,
        capabilityEnergyConsumption: false,
        waterPressure: null,
      },
    ],
  };
  const devices = convertDashboard(gladys, dashboard);
  const climate = devices.find((d) => d.external_id.startsWith('ext:test:climate:'));
  assert.deepEqual(
    climate.features.map((f) => f.external_id.split(':').pop()),
    ['target-temperature', 'room-temperature'],
  );
  const dhw = devices.find((d) => d.external_id.startsWith('ext:test:dhw:'));
  assert.deepEqual(
    dhw.features.map((f) => f.external_id.split(':').pop()),
    ['comfort-setpoint', 'water-temperature'],
  );
});

test('getApplianceId reads the applianceId param', () => {
  assert.equal(getApplianceId({ params: [{ name: 'applianceId', value: 'abc' }] }), 'abc');
  assert.throws(() => getApplianceId({ external_id: 'x', params: [] }), /applianceId/);
});

test('the finders locate zones and appliances by id', () => {
  assert.equal(findClimateZone(DASHBOARD, CLIMATE_ZONE_ID).climateZoneId, CLIMATE_ZONE_ID);
  assert.equal(findHotWaterZone(DASHBOARD, DHW_ZONE_ID).hotWaterZoneId, DHW_ZONE_ID);
  assert.equal(findAppliance(DASHBOARD, APPLIANCE_ID).applianceId, APPLIANCE_ID);
  assert.equal(findClimateZone(DASHBOARD, 'nope'), undefined);
});
