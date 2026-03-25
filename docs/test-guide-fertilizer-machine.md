# Fertilizer Machine Feature — Test Guide

## Prerequisites

- EMQX broker running (port 1883)
- PostgreSQL running
- Server running: `yarn start:dev`
- MQTT client: `mosquitto_pub` / `mosquitto_sub` or MQTT Explorer
- JWT token from `POST /api/auth/login`
- A paired device ID (status: `active`)

---

## 1. Enable Fertilizer Feature on Device

```bash
curl -X PATCH http://localhost:3000/api/device/<deviceId> \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "hasFertilizer": true }'
```

**Expected:** `200 OK` with device object showing `hasFertilizer: true`.

---

## 2. Test Guard — Reject Command When `hasFertilizer=false`

First, ensure device has `hasFertilizer: false` (default or explicitly set):

```bash
curl -X PATCH http://localhost:3000/api/device/<deviceId> \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "hasFertilizer": false }'
```

Send a fertilizer command:

```bash
curl -X POST http://localhost:3000/api/device/<deviceId>/command \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "command": "fertilizer_on" }'
```

**Expected:** `400 Bad Request`

```json
{
  "statusCode": 400,
  "message": "Device <deviceId> does not have a fertilizer machine"
}
```

---

## 3. Test Guard — Allow Command When `hasFertilizer=true`

Enable the feature:

```bash
curl -X PATCH http://localhost:3000/api/device/<deviceId> \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "hasFertilizer": true }'
```

Subscribe to device command topic (to verify MQTT publish):

```bash
mosquitto_sub -h localhost -p 1883 \
  -u <mqtt_user> -P <mqtt_pass> \
  -t "device/<deviceId>/cmd" -v
```

Send command:

```bash
curl -X POST http://localhost:3000/api/device/<deviceId>/command \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "command": "fertilizer_on" }'
```

**Expected:** `200 OK` + MQTT message on `device/<deviceId>/cmd`.

---

## 4. Test `fertilizerEnabled` State Sync via MQTT

Simulate device responding with `FERTILIZER_ON`:

```bash
mosquitto_pub -h localhost -p 1883 \
  -u <mqtt_user> -P <mqtt_pass> \
  -t "device/<deviceId>/resp" \
  -m '{ "command": "FERTILIZER_ON", "success": true }'
```

Check DB state updated:

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/api/device/<deviceId>
```

**Expected:** `fertilizerEnabled: true` in response.

Test `FERTILIZER_OFF`:

```bash
mosquitto_pub -h localhost -p 1883 \
  -u <mqtt_user> -P <mqtt_pass> \
  -t "device/<deviceId>/resp" \
  -m '{ "command": "FERTILIZER_OFF", "success": true }'
```

**Expected:** `fertilizerEnabled: false` in response.

---

## 5. Test Non-Fertilizer Commands Unaffected

Even with `hasFertilizer=false`, pump commands must work normally:

```bash
curl -X POST http://localhost:3000/api/device/<deviceId>/command \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "command": "pump_on" }'
```

**Expected:** `200 OK` — no guard triggered.

---

## 6. WebSocket State Change Event

Connect a WebSocket client to `ws://localhost:3000/device` with JWT, join room `device:<deviceId>`, then simulate `FERTILIZER_ON` response (step 4).

**Expected event received:**

```json
{
  "type": "fertilizerStateChanged",
  "fertilizerEnabled": true,
  "command": "FERTILIZER_ON",
  "timestamp": "..."
}
```

---

## 7. Unit Tests

```bash
yarn test --testPathPattern=sync.service
```

**Expected:** 4/4 tests pass.

| Test | Expected |
|------|----------|
| `fertilizer_on` + `hasFertilizer=false` | `BadRequestException` |
| `fertilizer_off` + `hasFertilizer=false` | `BadRequestException` |
| `fertilizer_on` + `hasFertilizer=true` | success |
| `pump_on` (any `hasFertilizer`) | success, no guard check |
