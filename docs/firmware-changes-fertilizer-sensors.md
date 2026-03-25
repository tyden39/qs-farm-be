# Firmware Changes — Fertilizer Sensor Integration

## Background

Pump and fertilizer run on the **same ESP device** (same `deviceId`). To distinguish their telemetry, the backend uses **separate payload keys** prefixed with `fert`. The ESP must send different keys for fertilizer hardware sensors.

---

## 1. New Telemetry Payload Keys

Add these keys to the telemetry JSON published to `device/<deviceId>/telemetry`:

| Key | Type | Unit | Description |
|-----|------|------|-------------|
| `fertStatus` | `int` | `0` / `1` | Fertilizer machine state (0=off, 1=on) |
| `fertControlMode` | `string` | `"manual"` / `"auto"` / `"schedule"` | Source of activation |
| `fertTemperature` | `float` | °C | Motor/pump body temperature |
| `fertCurrent` | `float` | A | Electrical current draw |
| `fertPhase` | `int` | `1`–`3` | Number of active electrical phases |
| `fertSessionId` | `string` | UUID | Session ID received from `device/<deviceId>/fert-session` |

> **Key rule:** Never reuse pump keys (`temperature`, `current`, `phase`, `pumpStatus`) for fertilizer hardware. Each component must have its own prefixed key.

---

## 2. Session Handshake Protocol

The server assigns a session UUID when fertilizer starts and publishes it to a dedicated topic. The ESP must store it and include it on stop.

### 2.1 Subscribe to fert-session topic

```
Topic: device/<deviceId>/fert-session
Payload: { "sessionId": "<uuid>", "timestamp": "<iso>" }
```

When received, store `sessionId` in memory.

### 2.2 Send fertSessionId on stop

When the fertilizer machine stops, include the stored `sessionId`:

```json
{
  "fertStatus": 0,
  "fertSessionId": "<uuid-received-from-fert-session-topic>"
}
```

If `fertSessionId` is missing or stale on stop, the backend closes the session as `INTERRUPTED (esp_reboot)`.

---

## 3. Telemetry Message Examples

### 3.1 Fertilizer start

```json
{
  "fertStatus": 1,
  "fertControlMode": "manual"
}
```

### 3.2 Periodic sensor readings (while running)

Send sensor data on regular intervals (recommend every 5s):

```json
{
  "fertTemperature": 38.5,
  "fertCurrent": 2.1,
  "fertPhase": 3
}
```

### 3.3 Fertilizer stop

```json
{
  "fertStatus": 0,
  "fertSessionId": "<uuid-from-fert-session-topic>"
}
```

### 3.4 Combined pump + fertilizer (both running simultaneously)

Both sets of keys can be sent in a single telemetry message:

```json
{
  "pumpStatus": 1,
  "temperature": 55.2,
  "pressure": 3.1,
  "flow": 12.4,
  "current": 8.2,
  "phase": 3,
  "fertStatus": 1,
  "fertTemperature": 38.5,
  "fertCurrent": 2.1,
  "fertPhase": 3
}
```

The backend correctly routes each key to its respective session and sensor type.

---

## 4. Command Handling

The backend sends commands via `device/<deviceId>/cmd`.

| Command | Action |
|---------|--------|
| `FERTILIZER_ON` | Start fertilizer machine |
| `FERTILIZER_OFF` | Stop fertilizer machine |

### 4.1 Respond with fertControlMode on FERTILIZER_ON

When the ESP starts the fertilizer in response to a command, include `fertControlMode` in the next telemetry:

```json
{
  "fertStatus": 1,
  "fertControlMode": "auto"
}
```

Use `"schedule"` if triggered by the onboard schedule, `"auto"` if triggered by threshold/automation, `"manual"` if triggered by direct command.

### 4.2 Send command response

```
Topic: device/<deviceId>/resp
Payload: { "command": "FERTILIZER_ON", "success": true }
```

---

## 5. Unchanged — Pump Keys

Existing pump payload keys are **not affected**:

```json
{
  "pumpStatus": 1,
  "temperature": 55.2,
  "pressure": 3.1,
  "flow": 12.4,
  "current": 8.2,
  "phase": 3,
  "sessionId": "<pump-session-uuid>"
}
```

Do **not** rename these keys.

---

## 6. Topic Summary

| Topic | Direction | Purpose |
|-------|-----------|---------|
| `device/<id>/telemetry` | ESP → Server | Sensor data + status events |
| `device/<id>/fert-session` | Server → ESP | Fertilizer session UUID assignment |
| `device/<id>/session` | Server → ESP | Pump session UUID assignment (unchanged) |
| `device/<id>/cmd` | Server → ESP | Commands (`FERTILIZER_ON/OFF`, `PUMP_ON/OFF`, etc.) |
| `device/<id>/resp` | ESP → Server | Command ACK |
| `device/<id>/status` | ESP → Server | Online/offline/LWT status |

---

## 7. LWT (Last Will Testament)

No change needed. The existing LWT on `device/<id>/status` with `{ "reason": "lwt" }` is sufficient — the backend closes both pump and fertilizer active sessions automatically.

---

## 8. Migration Notes

If current firmware sends fertilizer current/temperature/phase under pump keys (`current`, `temperature`, `phase`), the migration path is:

1. Add new `fert*` keys alongside existing keys
2. Backend automatically routes to correct sensor types
3. Once confirmed working, remove legacy shared keys from fertilizer hardware readings
