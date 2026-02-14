# Sensor Module — Usage Guide

All endpoints require JWT authentication via `Authorization: Bearer <token>` header.

Base URL: `/api/sensor`

---

## 1. Setup Sensor Config for a Device

Create a sensor config to enable monitoring for a specific sensor type on a device.

**Available sensor types:** `water_pressure`, `water_flow`, `pump_temperature`, `soil_moisture`, `electrical_current`

**Available modes:** `auto` (threshold evaluation enabled), `manual` (data stored but no threshold checks)

```bash
# Create soil moisture config in AUTO mode
POST /api/sensor/device/{deviceId}/config
{
  "sensorType": "soil_moisture",
  "enabled": true,
  "mode": "auto",
  "unit": "%"
}

# Create pump temperature config
POST /api/sensor/device/{deviceId}/config
{
  "sensorType": "pump_temperature",
  "enabled": true,
  "mode": "auto",
  "unit": "°C"
}
```

```bash
# List all configs for a device
GET /api/sensor/device/{deviceId}/config

# Update config (disable monitoring / switch to manual)
PATCH /api/sensor/device/{deviceId}/config/{configId}
{
  "enabled": false
}

# Delete config
DELETE /api/sensor/device/{deviceId}/config/{configId}
```

---

## 2. Configure Thresholds

Each sensor config supports two threshold levels: `warning` and `critical`. CRITICAL is evaluated first.

```bash
# Add WARNING threshold for soil moisture
POST /api/sensor/config/{configId}/threshold
{
  "level": "warning",
  "minThreshold": 55,
  "maxThreshold": 90,
  "action": "PUMP_ON"
}

# Add CRITICAL threshold for soil moisture
POST /api/sensor/config/{configId}/threshold
{
  "level": "critical",
  "minThreshold": 40,
  "maxThreshold": 95,
  "action": "SHUTDOWN_PUMP"
}

# Temperature — only upper bound (set min to null or omit)
POST /api/sensor/config/{configId}/threshold
{
  "level": "critical",
  "maxThreshold": 80,
  "action": "SHUTDOWN_PUMP"
}

# Alert-only (no MQTT command dispatched, just logs + WebSocket notification)
POST /api/sensor/config/{configId}/threshold
{
  "level": "warning",
  "maxThreshold": 70,
  "action": "ALERT_ONLY"
}
```

```bash
# List thresholds for a config
GET /api/sensor/config/{configId}/threshold

# Update threshold
PATCH /api/sensor/config/{configId}/threshold/{thresholdId}
{
  "maxThreshold": 85
}

# Delete threshold
DELETE /api/sensor/config/{configId}/threshold/{thresholdId}
```

---

## 3. Telemetry Flow (Automatic)

When a device publishes to MQTT topic `device/{deviceId}/telemetry`:

```json
{
  "soilMoisture": 38,
  "temperature": 82,
  "pressure": 2.5,
  "flow": 10,
  "current": 1.2
}
```

The system automatically:

1. **Stores** each sensor reading in `sensor_data` table
2. **Evaluates** thresholds for sensors with `mode: auto` and `enabled: true`
3. **Dispatches** MQTT command to `device/{deviceId}/cmd` if threshold violated
4. **Logs** alert in `alert_log` table
5. **Broadcasts** alert + command via WebSocket to room `device:{deviceId}`

Payload field mapping:

| JSON field      | Sensor type          |
|-----------------|----------------------|
| `pressure`      | water_pressure       |
| `flow`          | water_flow           |
| `temperature`   | pump_temperature     |
| `soilMoisture`  | soil_moisture        |
| `current`       | electrical_current   |

---

## 4. Query Sensor Data

```bash
# Get recent readings (default limit: 100)
GET /api/sensor/device/{deviceId}/data

# Filter by sensor type and date range
GET /api/sensor/device/{deviceId}/data?sensorType=soil_moisture&from=2026-02-01&to=2026-02-12&limit=50

# Get latest reading per sensor type
GET /api/sensor/device/{deviceId}/data/latest
```

---

## 5. Query & Manage Alerts

```bash
# Get all alerts for a device
GET /api/sensor/device/{deviceId}/alerts

# Filter alerts
GET /api/sensor/device/{deviceId}/alerts?sensorType=pump_temperature&level=critical&acknowledged=false

# Acknowledge an alert
PATCH /api/sensor/device/{deviceId}/alerts/{alertId}/acknowledge
```

---

## 6. WebSocket Events

Connect to Socket.IO namespace `/device` with JWT auth, then subscribe to a device room.

**Set up listeners first** (before or right after connect), then emit subscribe:

```javascript
// 1. Listen for connection confirmation
socket.on('connected', (msg) => {
  console.log('Server:', msg.message);
});

// 2. Listen for subscribe acknowledgment (use the callback on emit)
socket.emit('subscribeToDevice', { deviceId: 'xxx' }, (ack) => {
  if (ack) console.log('Subscribed:', ack);  // { event: 'subscribed', data: { deviceId, room } }
});

// 3. Listen for device data (telemetry, alerts, commands) — required to receive anything
socket.on('deviceData', (msg) => {
  console.log('deviceData', msg.data?.type, msg);
});
```

If you only `emit('subscribeToDevice', ...)` without a callback, you won't see the "subscribed" response. If you don't listen to `deviceData`, you won't receive telemetry or alerts. Data is only pushed when the device sends telemetry or when a threshold triggers an alert/command.

You'll receive these `deviceData` events:

```javascript
// Raw telemetry (existing)
socket.on('deviceData', (msg) => {
  // msg.data.type === 'telemetry'
});

// Threshold violation alert
socket.on('deviceData', (msg) => {
  // msg.data.type === 'alert'
  // msg.data = { type, sensorType, value, threshold, level, direction, action, reason }
});

// Automated command sent to device
socket.on('deviceData', (msg) => {
  // msg.data.type === 'command_dispatched'
  // msg.data = { type, command, sensorType, level, value, threshold, reason }
});
```

`deviceData` only fires when there is something to send (device telemetry, threshold alert, or command). If the device is idle or not configured, you won't get events until it reports or a threshold is hit.

### Troubleshooting: "I receive nothing"

| What you see | Cause | What to do |
|--------------|--------|------------|
| No `connected` event, socket disconnects | Invalid/missing JWT or wrong URL/namespace | Use a valid access token in `auth: { token }` or `Authorization: Bearer <token>`. Connect to `http://localhost:3000/device` (or your API base + `/device`). Check server logs for "Authentication error" or "connected without token". |
| `connected` but no confirmation after subscribe | You're not using the ack callback | Use `socket.emit('subscribeToDevice', { deviceId: 'xxx' }, (ack) => { console.log(ack); });` so the server's return value is received. The server does **not** emit a `subscribed` event; it only replies via this callback. |
| Subscribed (ack received) but no `deviceData` | Normal: no telemetry or alerts yet | `deviceData` is only sent when (1) the device sends telemetry over MQTT, or (2) a threshold triggers an alert/command. Ensure the device exists, is paired, and is publishing to the broker; or trigger a threshold to see alerts. Use `public/device-test.html` and watch the log for `connected`, the subscribe ack, and any `deviceData`. |

---

## 7. Anti-Spam

Two mechanisms prevent command flooding:

- **State machine**: If a command (e.g., `PUMP_ON`) was already dispatched and the pump is still in that state, duplicate commands are suppressed. State clears when the value returns to normal range.
- **Cooldown**: 30-second minimum interval between commands for the same device + sensor combination.

Both reset on server restart — the next telemetry reading re-evaluates and re-establishes state.

---

## 8. Example: Full Setup

```bash
# 1. Create sensor config for soil moisture on device
POST /api/sensor/device/abc-123/config
{ "sensorType": "soil_moisture", "mode": "auto", "unit": "%" }
# Response: { "id": "config-uuid", ... }

# 2. Add warning threshold
POST /api/sensor/config/config-uuid/threshold
{ "level": "warning", "minThreshold": 55, "maxThreshold": 90, "action": "PUMP_ON" }

# 3. Add critical threshold
POST /api/sensor/config/config-uuid/threshold
{ "level": "critical", "minThreshold": 40, "maxThreshold": 95, "action": "SHUTDOWN_PUMP" }

# Now when device publishes telemetry with soilMoisture < 55:
#   → MQTT command "PUMP_ON" sent to device/abc-123/cmd
#   → Alert logged in database
#   → WebSocket clients in room device:abc-123 receive alert + command_dispatched events

# If soilMoisture drops below 40:
#   → MQTT command "SHUTDOWN_PUMP" sent (CRITICAL evaluated first)
```
