# De Dietrich

Control your De Dietrich connected heating system from Gladys Assistant, through
the **De Dietrich** cloud (the same service used by the De Dietrich
mobile app, powered by the BDR Thermea platform).

## Features

- **Heating (climate zones)** — read the room temperature and read/set the
  target temperature of each heating zone. Setting a temperature applies a
  temporary override when the zone follows its schedule, or switches it to
  manual mode otherwise, exactly like the app.
- **Domestic hot water (DHW)** — read the current water temperature and
  read/set the comfort setpoint of each hot-water zone.
- **Boiler sensors** — read the outdoor temperature and the water pressure of
  the appliance.
- **Energy consumption** — read the cumulative heating and domestic-hot-water
  energy consumed (in kWh), when the appliance reports it. These are meter-style
  indexes that feed the Gladys energy graphs.

## Configuration

1. Install the integration from the Gladys integrations store.
2. Open its configuration and fill in the **email** and **password** of your
   De Dietrich account (the same credentials you use in the De Dietrich
   mobile app).
3. Go to the **Discovery** tab and start a scan: your heating zones, hot-water
   zones and boiler appear and can be added to Gladys.

Your devices are polled once per minute. Heating and hot-water setpoints you
change from Gladys are sent straight to the De Dietrich cloud.

## Notes

- This integration talks to the De Dietrich cloud, so an internet
  connection and a working De Dietrich account are required.
- Your credentials are stored encrypted by Gladys and are only used to
  authenticate against the De Dietrich cloud.
