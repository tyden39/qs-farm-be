# Manual Test Guide — Farm Room + Conditional FCM

## Prerequisites

- Server running: `yarn start:dev`
- PostgreSQL + EMQX running: `docker-compose up`
- A user with JWT token (login via `/api/auth/signin`)
- At least 1 farm with 1+ devices
- WebSocket client: [Postman](https://www.postman.com/), `wscat`, or custom script

## Setup

```bash
# Get access token
curl -X POST http://localhost:3000/api/auth/signin \
  -H 'Content-Type: application/json' \
  -d '{"email":"<email>","password":"<password>"}'

# Save the accessToken from response
TOKEN="<accessToken>"
```

---

## Test 1: Subscribe to Farm Room

**Goal:** Client subscribes to `farm:{farmId}` and receives events from all devices in that farm.

### Steps

1. Connect to WebSocket:
```javascript
const io = require('socket.io-client');
const socket = io('http://localhost:3000/device', {
  auth: { token: TOKEN },
});

socket.on('connect', () => console.log('Connected:', socket.id));
socket.on('deviceData', (data) => console.log('deviceData:', JSON.stringify(data)));
socket.on('deviceStatus', (data) => console.log('deviceStatus:', JSON.stringify(data)));
```

2. Subscribe to farm:
```javascript
socket.emit('subscribeToFarm', { farmId: '<farmId>' }, (res) => {
  console.log('Subscribe response:', res);
});
```

3. Publish telemetry from any device in that farm via MQTT:
```bash
mosquitto_pub -h localhost -p 1883 \
  -u '<mqtt_user>' -P '<mqtt_pass>' \
  -t 'device/<deviceId>/telemetry' \
  -m '{"temp":35.5,"humidity":80}'
```

### Expected

- Subscribe response: `{ event: 'subscribed', data: { farmId, room: 'farm:<farmId>' } }`
- `deviceData` event received with telemetry payload
- Server log: `Client <id> subscribed to farm <farmId>`

---

## Test 2: Unsubscribe from Farm Room

### Steps

```javascript
socket.emit('unsubscribeFromFarm', { farmId: '<farmId>' }, (res) => {
  console.log('Unsubscribe response:', res);
});
```

Then publish telemetry again (same as Test 1 step 3).

### Expected

- Unsubscribe response: `{ event: 'unsubscribed', data: { farmId } }`
- No `deviceData` event received after unsubscribe

---

## Test 3: No Duplicate Events (Both Rooms)

**Goal:** Client in both `device:<deviceId>` AND `farm:<farmId>` receives each event only once.

### Steps

```javascript
socket.emit('subscribeToDevice', { deviceId: '<deviceId>' });
socket.emit('subscribeToFarm', { farmId: '<farmId>' });

let count = 0;
socket.on('deviceData', () => count++);

// Publish one telemetry message
// Wait 2 seconds
setTimeout(() => console.log('Events received:', count), 2000);
```

### Expected

- `count` should be **1** (not 2)
- Socket.IO deduplicates when a socket is in multiple rooms of the same `to()` call

---

## Test 4: Backward Compatibility (subscribeToDevice)

**Goal:** Existing per-device subscriptions still work.

### Steps

1. Subscribe to device only (do NOT subscribe to farm):
```javascript
socket.emit('subscribeToDevice', { deviceId: '<deviceId>' });
```

2. Publish telemetry for that device via MQTT.

### Expected

- `deviceData` event received as before
- No regression in existing behavior

---

## Test 5: Conditional FCM — User Online (Skip FCM)

**Goal:** FCM is NOT sent when user has active WebSocket connection.

### Steps

1. Connect WebSocket with valid token (user is now "online")
2. Trigger a threshold alert:
   - Ensure device has a sensor config with thresholds
   - Publish telemetry that exceeds threshold:
   ```bash
   mosquitto_pub -h localhost -p 1883 \
     -u '<mqtt_user>' -P '<mqtt_pass>' \
     -t 'device/<deviceId>/telemetry' \
     -m '{"temp":99}'
   ```

### Expected

- Server log: `Skipping FCM for <deviceId> — user <userId> is online`
- WebSocket `deviceData` event with `type: 'alert'` IS received
- No FCM push notification on mobile device

---

## Test 6: Conditional FCM — User Offline (Send FCM)

**Goal:** FCM is sent when user has NO active WebSocket connection.

### Steps

1. Disconnect all WebSocket clients for the farm owner
2. Trigger threshold alert (same MQTT publish as Test 5)

### Expected

- No "Skipping FCM" log
- Server log: FCM sent (or `FCM alert failed` if FCM not configured)
- Mobile receives FCM push notification (if FCM configured)

---

## Test 7: Farm-Level Broadcasts (All Event Types)

**Goal:** All broadcast types reach farm room subscribers.

### Steps

Subscribe to farm, then trigger each event type:

| Event | Trigger | Expected WS Event |
|-------|---------|-------------------|
| Telemetry | MQTT `device/<id>/telemetry` | `deviceData` with `type: 'telemetry'` |
| Status | MQTT `device/<id>/status` | `deviceStatus` |
| Command response | MQTT `device/<id>/resp` | `deviceStatus` with `type: 'commandResponse'` |
| Alert | Telemetry exceeding threshold | `deviceData` with `type: 'alert'` |
| Command sent | Send command via API | `deviceStatus` with `type: 'commandSent'` |

---

## Test 8: Schedule FCM Gating

**Goal:** Scheduled command FCM is skipped when user is online.

### Steps

1. Create a one-time schedule for near-future execution:
```bash
curl -X POST http://localhost:3000/api/schedules \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Test schedule",
    "deviceId": "<deviceId>",
    "command": "RELAY_ON",
    "params": {},
    "type": "one_time",
    "executeAt": "<ISO timestamp 1-2 min from now>",
    "timezone": "Asia/Ho_Chi_Minh"
  }'
```

2. Keep WebSocket connected (user online)
3. Wait for schedule execution (~1 min interval)

### Expected

- Server log: `Skipping FCM for schedule <id> — user <userId> is online`
- Schedule executes normally (command sent to device)

---

## Quick Checklist

| # | Test | Pass? |
|---|------|-------|
| 1 | Subscribe to farm room | |
| 2 | Unsubscribe from farm room | |
| 3 | No duplicate events (both rooms) | |
| 4 | Backward compatible (subscribeToDevice) | |
| 5 | FCM skipped when online | |
| 6 | FCM sent when offline | |
| 7 | All event types reach farm room | |
| 8 | Schedule FCM gating | |
