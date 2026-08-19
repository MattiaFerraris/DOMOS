# DOMOS — Backend

The **unification layer** of [DOMOS](../README.md): a [NestJS](https://nestjs.com/) server that exposes one REST API and routes each command to the protocol a device actually speaks — TP-Link Tapo, TP-Link Kasa, Zigbee via `zigbee2mqtt`, or raw 802.15.4 frame replay for the Nenko light.

See the [root README](../README.md) for the project overview and architecture diagram.

## Running

```bash
npm install
cp .env.example .env        # fill in the values (see Configuration)
npm run start:dev           # watch mode → http://localhost:3000
```

| Script | What it does |
| --- | --- |
| `npm run start` | Start once |
| `npm run start:dev` | Start in watch mode |
| `npm run start:prod` | Run the compiled build (`node dist/main`) |
| `npm run build` | Compile to `dist/` |
| `npm test` | Run all `*.spec.ts` |
| `npm run test:watch` | Jest in watch mode |
| `npm run test:cov` | Tests with coverage (written to `coverage/`) |
| `npm run lint` | ESLint with `--fix` |
| `npm run format` | Prettier over `src/` |

Two things to know about the bootstrap (`src/main.ts`): there is **no global route prefix** — every controller declares its own `api/…` path — and **CORS is open to all origins**, which is fine for a LAN dashboard but should be restricted before any public deployment.

## Modules

Everything lives under `src/devices/`, wired by `app.module.ts`.

| Module | Key provider | Routes | Role |
| --- | --- | --- | --- |
| `tplink-cloud/` | `TplinkCloudService` | `/api/tapo/*` | **Coordinator**: cloud discovery, IP resolution, protocol detection, command routing |
| `tapo/` | `TapoService` | — | Worker: Tapo local protocol (`tp-link-tapo-connect`) |
| `kasa/` | `KasaService` | — | Worker: Kasa local protocol (`tplink-smarthome-api`) |
| `zigbee/` | `MqttService` | `/api/zigbee/*` | MQTT client for `zigbee2mqtt`: catalog, state cache, unit conversion |
| `nenko/` | `NenkoService` | `/api/nenko/*` | Serial bridge to the nRF52840 dongle, replays captured 802.15.4 frames |
| `scheduler/` | `SchedulerService` | `/api/scheduler/*` | Server-side one-shot timers and recurring schedules |

`scheduler/` has no module file of its own: `SchedulerService` and `SchedulerController` are declared inside `TplinkCloudModule`, because the scheduler dispatches its actions through the coordinator.

**Coordinator internals** — the cloud session is cached ~30 min and the device list ~5 min. Every local call is wrapped in a 4 s timeout (`DEVICE_TIMEOUT_MS`), so one stale IP in `device-config.json` marks a single device `offline` instead of hanging `GET /api/tapo/list`.

**Serial internals** — `NenkoService` opens the port only if `NENKO_SERIAL_PATH` is set, forces DTR/RTS high (the Zephyr firmware waits for DTR before enabling RX), and serializes writes through a promise queue with a 1 s timeout per frame, because the firmware is single-buffered and answers `OK <n> byte` / `ERR: …` one frame at a time.

## Configuration

### Environment (`.env`)

| Variable | Default | Used for |
| --- | --- | --- |
| `TPLINK_EMAIL` / `TPLINK_PASSWORD` | — | TP-Link cloud login (device discovery only) |
| `MQTT_BROKER_URL` | — | MQTT broker, e.g. `mqtt://localhost:1883`. Empty → Zigbee disabled |
| `ZIGBEE2MQTT_BASE_TOPIC` | `zigbee2mqtt` | Base topic subscribed by `MqttService` |
| `MQTT_USERNAME` / `MQTT_PASSWORD` | empty | Broker credentials, if required |
| `NENKO_SERIAL_PATH` | empty | Dongle serial port. Empty → `NenkoService` stays inactive |
| `NENKO_BAUD` | `115200` | Serial baud rate |
| `PORT` | `3000` | HTTP port |

### Data files (in the backend working directory)

| File | Who writes it | Purpose |
| --- | --- | --- |
| `device-config.json` | **you** | `deviceId → LAN IP` map. Without it a device cannot be controlled locally |
| `devices-info.json` | auto | Cached catalog from the cloud (id, alias, model, MAC, type) |
| `schedules.json` | auto | Persisted timers and schedules, reloaded and re-armed at startup |
| `src/devices/nenko/nenko-buttons.json` | **you** (captured once) | Remote-button → 802.15.4 frame map, versioned with the code |

`.env`, `device-config.json` and `devices-info.json` are git-ignored; `.env.example` and `schedules.json` are tracked.

## REST API

Base URL `http://localhost:3000/api`. Every successful response uses the envelope `{ "status": "OK", "data": … }` (`data` is omitted by write endpoints that return nothing).

### `/api/tapo` — Tapo & Kasa

| Method | Path | Body / query | Errors |
| --- | --- | --- | --- |
| `GET` | `/list` | — | `500` if the cloud lookup fails |
| `POST` | `/power` | `{ deviceId: string, state: boolean }` | `400` missing params · `500` device unreachable |
| `POST` | `/light` | `{ deviceId, state, brightness?, color? }` | `400` missing params · `500` device unreachable |
| `GET` | `/energy` | `?deviceId=…` | `400` if `deviceId` is missing |
| `GET` | `/info` | `?deviceId=…` | `400` if `deviceId` is missing |

`brightness` defaults to `100` and `color` to `"white"`. `color` accepts a hex string or a named color; `brightness` is `0–100`.

`GET /list` returns the cloud catalog augmented with live state:

```jsonc
{ "deviceId": "8023…", "alias": "Lampada", "deviceModel": "L530",
  "device_on": true, "brightness": 80, "color": "#ff8800", "offline": false }
```

`offline: true` means the device has no IP mapped, or did not answer within the timeout.

### `/api/zigbee` — zigbee2mqtt

| Method | Path | Body / query | Errors |
| --- | --- | --- | --- |
| `GET` | `/list` | — | — |
| `GET` | `/state` | `?device=<friendlyName>` | `400` if `device` is missing |
| `POST` | `/power` | `{ device: string, state: boolean }` | `400` missing params · `500` broker not connected |
| `POST` | `/light` | `{ device, state, brightness?, color? }` | `400` missing params · `500` broker not connected |

Devices are addressed by their **friendly name**. Brightness is exposed as `0–100 %` and converted to the Zigbee `0–254` range internally; color is always a `#rrggbb` hex string on the API side, converted from whatever `zigbee2mqtt` reports (`hex`, CIE `xy`, or `hue`/`saturation`). If the broker was never reachable, `/list` returns an empty array instead of failing; if the bridge goes down after being seen, the known devices are still listed but flagged `offline: true`.

### `/api/nenko` — Nenko light

| Method | Path | Body | Errors |
| --- | --- | --- | --- |
| `GET` | `/presets` | — | — |
| `GET` | `/state` | — | — |
| `POST` | `/preset` | `{ name: string }` | `500` if the frame was not acknowledged |

`/presets` lists `{ name, label, tipo, rgb }` per button, where `tipo` is `"colore"` or `"effetto"`. `/state` returns `{ color? }` — the last preset **sent**, since the light never reports back.

`arcobaleno` is special-cased in `sendPreset`: it transmits a randomly chosen `"colore"` frame, so its own captured frame in `nenko-buttons.json` is never sent and `/state` reports the random color that was picked.

### `/api/scheduler` — timers & schedules

| Method | Path | Body | Errors |
| --- | --- | --- | --- |
| `GET` | `/timers` | — | — |
| `POST` | `/timer` | `{ deviceId, delayMinutes: number, targetState: boolean }` | `400` invalid params |
| `DELETE` | `/timer/:id` | — | — |
| `GET` | `/schedules` | — | — |
| `POST` | `/schedule` | `{ deviceId, targetState, time: "HH:MM", days: number[], enabled? }` | `400` invalid params |
| `PATCH` | `/schedule/:id` | any subset of the above | `404` unknown id |
| `DELETE` | `/schedule/:id` | — | — |

`days` uses `0 = Sunday … 6 = Saturday`; `enabled` defaults to `true`; `time` must match `HH:MM`. A device has at most one active one-shot timer: adding a second one replaces it. Recurring schedules are evaluated by a 60 s tick with same-minute de-duplication.

Scheduled actions go through `TplinkCloudService.setDevicePower`, so they apply to **Tapo/Kasa devices only** — Zigbee and Nenko devices cannot be scheduled yet.

## Normalized readings

`GET /api/tapo/energy` returns `DeviceEnergy`, which hides the fact that the two vendors report different units and field names:

```ts
{ supported: boolean; powerW?: number; todayKwh?: number; monthKwh?: number; voltage?: number }
```

- **Tapo** reports `current_power` in mW and `today_energy` / `month_energy` in Wh → all divided by 1000.
- **Kasa** reports either modern fields already in W/V/kWh (`power`, `voltage`, `total`) or legacy ones in milli-units (`power_mw`, `voltage_mv`, `total_wh`) → the modern field wins when both are present, otherwise the legacy one is divided by 1000. Kasa exposes no monthly total, so `monthKwh` stays `undefined`.
- Missing values stay `undefined` (never `0` or `NaN`), while a real `0` reading is preserved.
- `supported: false` means: no IP mapped, no metering hardware, or the read failed.

`GET /api/tapo/info` returns `DeviceInfo`: `{ rssi?, signal?, overheated?, firmware?, ssid? }`.

## Testing

```bash
npm test            # all *.spec.ts
npm run test:cov    # with coverage → coverage/
npx jest kasa       # single suite by filename
```

Jest is configured inline in `package.json` (`rootDir: src`, `testRegex: .*\.spec\.ts$`), so there is no `jest.config.js` and tests must be run from this directory.

| Suite | Focus |
| --- | --- |
| `tapo/tapo.service.spec.ts` | State reading, HSV → hex conversion, on/off and light commands |
| `kasa/kasa.service.spec.ts` | Session caching and invalidation, emeter presence |
| `zigbee/mqtt.service.spec.ts` | Catalog from `bridge/devices`, state ingestion, published `set` commands |
| `scheduler/scheduler.service.spec.ts` | Timer arming, persistence, recurring tick |
| `tplink-cloud/tplink-cloud.service.spec.ts` | Energy normalization across both vendors |

Every suite runs against **mocks**: the vendor libraries, the MQTT client, the serial port and `fs` are all stubbed, so no hardware, network or disk access is involved. There are no end-to-end tests (and no `test:e2e` script).

## Adding another protocol

1. Create a module under `src/devices/<protocol>/` with a service that talks to the hardware.
2. Either expose it as its own controller (like `zigbee/` and `nenko/`), or plug it into `TplinkCloudService` if the device belongs in the unified `/api/tapo/list` view.
3. Normalize the device into the shared shape (`device_on`, `brightness`, `color`) and convert units at the boundary, not in the frontend.
4. Import the module in `app.module.ts` and add a `*.spec.ts` with a mocked transport.
