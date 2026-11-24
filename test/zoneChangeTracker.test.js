import test from 'node:test';
import assert from 'node:assert/strict';

import { ZoneChangeTracker } from '../src/devices/zoneChangeTracker.js';
import { APPLIANCE, CLIMATE_ZONE, DASHBOARD } from './fixtures.js';

function dashboardWith(zoneOverrides = {}, applianceOverrides = {}) {
  return {
    appliances: [
      {
        ...APPLIANCE,
        ...applianceOverrides,
        climateZones: [{ ...CLIMATE_ZONE, ...zoneOverrides }],
      },
    ],
  };
}

test('first observation logs the initial state of every zone and appliance', () => {
  const lines = new ZoneChangeTracker().observe(DASHBOARD);
  assert.deepEqual(lines, [
    'Appliance state: operatingMode=AutomaticHeating applianceOnline=true errorStatus=Running',
    'Climate zone "0" state: zoneMode=Scheduling setPoint=19 currentScheduleSetPoint=16',
    'Hot-water zone "DHW" state: dhwZoneMode=Scheduling comfortSetPoint=50 targetSetpoint=15',
  ]);
});

test('an unchanged dashboard logs nothing', () => {
  const tracker = new ZoneChangeTracker();
  tracker.observe(dashboardWith());
  assert.deepEqual(tracker.observe(dashboardWith()), []);
});

test('the same (cached) dashboard object is only looked at once', () => {
  const tracker = new ZoneChangeTracker();
  const dashboard = dashboardWith();
  tracker.observe(dashboard);
  dashboard.appliances[0].climateZones[0].zoneMode = 'Manual';
  assert.deepEqual(tracker.observe(dashboard), []);
});

test('a switch to frost protection logs the mode and setpoint change', () => {
  const tracker = new ZoneChangeTracker();
  tracker.observe(dashboardWith());
  const lines = tracker.observe(dashboardWith({ zoneMode: 'FrostProtection', setPoint: 6 }));
  assert.deepEqual(lines, [
    'Climate zone "0" changed: zoneMode: Scheduling -> FrostProtection, setPoint: 19 -> 6',
  ]);
});

test('appliance state changes are logged', () => {
  const tracker = new ZoneChangeTracker();
  tracker.observe(dashboardWith());
  const lines = tracker.observe(dashboardWith({}, { applianceOnline: false }));
  assert.deepEqual(lines, ['Appliance changed: applianceOnline: true -> false']);
});
