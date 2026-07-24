// Shared De Dietrich fixtures. Shapes taken from a real /homes/dashboard
// payload (De Dietrich boiler): setpoints are plain numbers, climate zones use
// setPoint/roomTemperature, hot-water zones use comfortSetPoint/dhwTemperature
// and a setPointRanges object, and the outdoor temperature lives in
// outdoorTemperatureInformation.

export const APPLIANCE_ID = 'fbe8c875-7f87-4307-bb2f-70522fd329cb';
export const CLIMATE_ZONE_ID = '3a848e52-9723-4250-cb32-08de63d42495';
export const DHW_ZONE_ID = '6e0015b3-40b6-43f5-83fb-08de63d4249a';

export const CLIMATE_ZONE = {
  climateZoneId: CLIMATE_ZONE_ID,
  applianceId: APPLIANCE_ID,
  name: '0',
  zoneType: 'CH',
  zoneMode: 'Scheduling',
  roomTemperature: 26.5,
  setPoint: 19,
  nextSetpoint: 20,
  setPointMin: 5,
  setPointMax: 30,
  currentScheduleSetPoint: 16,
  capabilityCooling: false,
};

export const DHW_ZONE = {
  hotWaterZoneId: DHW_ZONE_ID,
  applianceId: APPLIANCE_ID,
  name: 'DHW',
  zoneType: 'DHW',
  dhwZoneMode: 'Scheduling',
  dhwStatus: 'Idle',
  dhwType: 'Tank',
  dhwTemperature: 54.6,
  targetSetpoint: 15,
  reducedSetpoint: 15,
  comfortSetPoint: 50,
  setPointMin: 35,
  setPointMax: 60,
  setPointRanges: {
    comfortSetpointMin: 35,
    comfortSetpointMax: 60,
    reducedSetpointMin: 7,
    reducedSetpointMax: 50,
  },
};

export const APPLIANCE = {
  applianceId: APPLIANCE_ID,
  applianceOnline: true,
  applianceType: 'Boiler',
  houseName: 'Home',
  errorStatus: 'Running',
  operatingMode: 'AutomaticHeating',
  outdoorTemperatureInformation: {
    outdoorTemperatureSource: 'None',
    internetOutdoorTemperature: null,
    applianceOutdoorTemperature: null,
    cloudOutdoorTemperature: 29,
  },
  waterPressure: 1.9,
  waterPressureOK: true,
  capabilityOutdoorTemperature: true,
  capabilityEnergyConsumption: true,
  capabilityCooling: false,
  climateZones: [CLIMATE_ZONE],
  hotWaterZones: [DHW_ZONE],
  solarThermals: [],
};

export const DASHBOARD = {
  appliances: [APPLIANCE],
};
