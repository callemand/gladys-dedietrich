// -----------------------------------------------------------------------------
// De Dietrich (BDR Thermea cloud) protocol constants + the few Gladys
// values not exported by the SDK.
//
// The De Dietrich app talks to the same BDR Thermea backend as the Remeha
// Home app: an Azure AD B2C OAuth2 login (remehalogin.bdrthermea.net) followed
// by the mobile API (api.bdrthermea.net/Mobile/api). Field shapes here were
// verified against the real /homes/dashboard payload of a De Dietrich boiler.
// -----------------------------------------------------------------------------

// --- OAuth2 B2C login endpoints ----------------------------------------------
// The env var overrides exist only for the test suite (fake login server).
export const LOGIN_BASE = (
  process.env.DEDIETRICH_LOGIN_BASE ||
  'https://remehalogin.bdrthermea.net/bdrb2cprod.onmicrosoft.com'
).replace(/\/+$/, '');

// B2C user-flow / policy. Case matters in the path vs the query in the real
// backend, but it is passed verbatim in both places by the app, so keep it as
// delivered by the app.
export const B2C_POLICY = 'B2C_1A_RPSignUpSignInNewRoomV3.1';
export const OAUTH_CLIENT_ID = '6ce007c6-0628-419e-88f4-bee2e6418eec';
export const OAUTH_REDIRECT_URI = 'com.b2c.remehaapp://login-callback';
export const OAUTH_SCOPE =
  'openid https://bdrb2cprod.onmicrosoft.com/iotdevice/user_impersonation offline_access';
// Brand hint sent to the login page. The BDR Thermea B2C tenant is shared
// across brands (Remeha, De Dietrich, Baxi...); the De Dietrich app
// authenticates against this same tenant.
export const OAUTH_BRAND = 'remeha';

// --- Mobile API --------------------------------------------------------------
export const API_BASE = (
  process.env.DEDIETRICH_API_BASE || 'https://api.bdrthermea.net/Mobile/api'
).replace(/\/+$/, '');

// Azure API Management subscription key sent with every API request (the same
// public key the mobile app ships with).
export const API_SUBSCRIPTION_KEY =
  process.env.DEDIETRICH_SUBSCRIPTION_KEY || 'df605c5470d846fc91e848b1cc653ddf';

// --- Gladys wiring -----------------------------------------------------------
// Heating changes slowly: poll once per minute (the slowest allowed Gladys
// frequency, DEVICE_POLL_FREQUENCIES.EVERY_MINUTES).
export const POLL_FREQUENCY = 60 * 1000;

// The dashboard call returns every appliance/zone at once. Gladys polls each
// device independently and near-simultaneously, so cache the dashboard for a
// few seconds to collapse the burst into a single upstream request.
export const DASHBOARD_CACHE_TTL_MS = 5 * 1000;

// Energy consumption lives behind a separate, slow-moving endpoint (buckets
// updated at most daily), so cache it far longer than the dashboard.
export const ENERGY_CACHE_TTL_MS = 10 * 60 * 1000;

// Wide fixed range for the cumulative energy query. The API returns one bucket
// per year; unreported years count as 0, so summing every bucket in this range
// yields the all-time cumulative consumption (a monotonic meter index).
export const ENERGY_RANGE = {
  START: '2015-01-01T00:00:00.000Z',
  END: '2035-12-31T00:00:00.000Z',
};

// --- Device external-id slugs ------------------------------------------------
export const CLIMATE_SLUG = 'climate';
export const DHW_SLUG = 'dhw';

// Device param carrying the parent appliance id (needed to locate the zone in
// the dashboard at poll/set time).
export const APPLIANCE_ID_PARAM = 'applianceId';

// --- Feature codes (last segment of the feature external id) -----------------
export const FEATURE_CODES = {
  // Climate zone (CH)
  TARGET_TEMPERATURE: 'target-temperature',
  ROOM_TEMPERATURE: 'room-temperature',
  // Hot water zone (DHW)
  DHW_COMFORT_SETPOINT: 'comfort-setpoint',
  DHW_TEMPERATURE: 'water-temperature',
  // Boiler / appliance sensors
  OUTDOOR_TEMPERATURE: 'outdoor-temperature',
  WATER_PRESSURE: 'water-pressure',
  HEATING_ENERGY: 'heating-energy',
  HOT_WATER_ENERGY: 'hot-water-energy',
};

// --- Climate zone modes (zoneMode field) -------------------------------------
export const CLIMATE_ZONE_MODES = {
  SCHEDULING: 'Scheduling',
  MANUAL: 'Manual',
  TEMPORARY_OVERRIDE: 'TemporaryOverride',
  FROST_PROTECTION: 'FrostProtection',
};

// --- Temperature / pressure fallback bounds ----------------------------------
// Used only when the API does not report a range for a zone.
export const DEFAULT_CH_BOUNDS = { MIN: 5, MAX: 30 };
export const DEFAULT_DHW_BOUNDS = { MIN: 35, MAX: 65 };
export const OUTDOOR_TEMPERATURE_BOUNDS = { MIN: -40, MAX: 60 };
export const WATER_PRESSURE_BOUNDS = { MIN: 0, MAX: 5 }; // bar
