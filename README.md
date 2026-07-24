# Gladys De Dietrich integration

An [external integration](https://gladysassistant.com/docs/dev/external-integrations/)
for [Gladys Assistant](https://gladysassistant.com) that controls **De Dietrich**
connected heating systems through the **De Dietrich** cloud (the BDR
Thermea platform, shared with the Remeha Home / De Dietrich mobile apps).

## Features

- **Heating (climate zones)**: room temperature (read), target temperature
  (read/write — temporary override or manual mode, like the app).
- **Domestic hot water (DHW)**: water temperature (read), comfort setpoint
  (read/write).
- **Boiler sensors**: outdoor temperature, water pressure.

## How it works

The De Dietrich app authenticates against an Azure AD B2C tenant
(`remehalogin.bdrthermea.net`) with an OAuth2 authorization-code + PKCE flow,
then calls the mobile API at `api.bdrthermea.net/Mobile/api`. This integration
replays the same flow with the credentials you configure in Gladys, reads
`/homes/dashboard` to discover and poll devices, and posts to the
`climate-zones` / `hot-water-zones` endpoints to apply setpoint changes.

## Configuration

| Key        | Description                    |
| ---------- | ------------------------------ |
| `email`    | Your De Dietrich account email |
| `password` | Your De Dietrich password      |

## Development

```bash
npm install
npm test          # node --test (unit + e2e, no network)
npm run lint
npm run format
```

`scripts/probe.js` is a one-shot dev helper that logs in and dumps the real
`/homes/dashboard` payload (set `DEDIETRICH_EMAIL` / `DEDIETRICH_PASSWORD`); it
is not shipped in the Docker image.

## License

Apache-2.0
