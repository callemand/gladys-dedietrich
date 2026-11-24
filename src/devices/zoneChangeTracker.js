// -----------------------------------------------------------------------------
// Diagnostic tracker: remembers the last seen mode / setpoint of every climate
// zone (and the operating state of its appliance) and reports what changed
// between two dashboards.
//
// Changes made outside Gladys (De Dietrich app, room thermostat, boiler) are
// otherwise invisible in the integration logs: only the resulting setpoint
// shows up in Gladys. Logging the zone mode next to the setpoint tells, after
// the fact, whether the zone went to frost protection, a holiday/away mode, a
// manual setpoint or simply followed its schedule.
// -----------------------------------------------------------------------------

// Climate zone fields worth logging when they change.
const ZONE_FIELDS = ['zoneMode', 'setPoint', 'currentScheduleSetPoint', 'activeComfortDemand'];

// Hot-water zone fields worth logging when they change.
const DHW_FIELDS = ['dhwZoneMode', 'comfortSetPoint', 'targetSetpoint'];

// Appliance fields worth logging when they change.
const APPLIANCE_FIELDS = ['operatingMode', 'applianceOnline', 'errorStatus'];

function pick(source, fields) {
  const snapshot = {};
  for (const field of fields) {
    if (source[field] !== undefined) {
      snapshot[field] = source[field];
    }
  }
  return snapshot;
}

function format(snapshot) {
  return Object.entries(snapshot)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
}

function diff(previous, current) {
  const keys = new Set([...Object.keys(previous), ...Object.keys(current)]);
  return [...keys]
    .filter((key) => previous[key] !== current[key])
    .map((key) => `${key}: ${previous[key]} -> ${current[key]}`)
    .join(', ');
}

export class ZoneChangeTracker {
  constructor() {
    this._seen = new Map(); // key -> snapshot
    this._lastDashboard = null;
  }

  /**
   * Compare a dashboard with the previously observed one.
   * @param {object} dashboard the /homes/dashboard payload
   * @returns {string[]} human-readable log lines (empty when nothing changed)
   */
  observe(dashboard) {
    // The client caches the dashboard: the same object comes back for every
    // device of a poll burst, so skip it after the first look.
    if (!dashboard || dashboard === this._lastDashboard) {
      return [];
    }
    this._lastDashboard = dashboard;

    const lines = [];
    for (const appliance of dashboard.appliances || []) {
      lines.push(
        ...this.#track(
          `appliance:${appliance.applianceId}`,
          'Appliance',
          pick(appliance, APPLIANCE_FIELDS),
        ),
      );
      for (const zone of appliance.climateZones || []) {
        lines.push(
          ...this.#track(
            `climate:${zone.climateZoneId}`,
            `Climate zone "${zone.name ?? zone.climateZoneId}"`,
            pick(zone, ZONE_FIELDS),
          ),
        );
      }
      for (const zone of appliance.hotWaterZones || []) {
        lines.push(
          ...this.#track(
            `dhw:${zone.hotWaterZoneId}`,
            `Hot-water zone "${zone.name ?? zone.hotWaterZoneId}"`,
            pick(zone, DHW_FIELDS),
          ),
        );
      }
    }
    return lines;
  }

  #track(key, label, snapshot) {
    const previous = this._seen.get(key);
    this._seen.set(key, snapshot);
    if (!previous) {
      return [`${label} state: ${format(snapshot)}`];
    }
    const changes = diff(previous, snapshot);
    return changes ? [`${label} changed: ${changes}`] : [];
  }
}
