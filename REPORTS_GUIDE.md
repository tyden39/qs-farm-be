# Reports, Statistics & Command History — Usage Guide

All endpoints require JWT authentication (`Authorization: Bearer <token>`).
Base URL: `/api/sensor`

---

## Device-Level Endpoints

### 1. GET `/sensor/device/:deviceId/stats`

Aggregate stats (min/max/avg/count) for a single sensor type on a device.

**Query params:**

| Param | Required | Description |
|-------|----------|-------------|
| sensorType | yes | `water_pressure`, `water_flow`, `pump_temperature`, `soil_moisture`, `electrical_current` |
| from | no | ISO 8601 datetime filter start |
| to | no | ISO 8601 datetime filter end |

**Example:**

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/sensor/device/DEVICE_UUID/stats?sensorType=soil_moisture&from=2026-02-01T00:00:00Z&to=2026-02-12T23:59:59Z"
```

**Response:**

```json
{
  "min": 22.5,
  "max": 78.3,
  "avg": 45.127,
  "count": "1842"
}
```

---

### 2. GET `/sensor/device/:deviceId/stats/timeseries`

Bucketed time-series data for charting. Uses PostgreSQL `DATE_TRUNC` for grouping.

**Query params:**

| Param | Required | Description |
|-------|----------|-------------|
| sensorType | yes | Sensor type enum |
| bucket | no | `hour` (default), `day`, `week`, `month` |
| from | no | ISO 8601 start |
| to | no | ISO 8601 end |

**Example:**

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/sensor/device/DEVICE_UUID/stats/timeseries?sensorType=water_pressure&bucket=day&from=2026-02-01T00:00:00Z"
```

**Response:**

```json
[
  { "bucket": "2026-02-01T00:00:00.000Z", "min": 1.2, "max": 3.8, "avg": 2.45, "count": "288" },
  { "bucket": "2026-02-02T00:00:00.000Z", "min": 1.1, "max": 4.0, "avg": 2.51, "count": "275" }
]
```

---

### 3. GET `/sensor/device/:deviceId/alerts/summary`

Alert counts grouped by level, sensor type, and acknowledged status.

**Query params:**

| Param | Required | Description |
|-------|----------|-------------|
| from | no | ISO 8601 start |
| to | no | ISO 8601 end |

**Example:**

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/sensor/device/DEVICE_UUID/alerts/summary"
```

**Response:**

```json
[
  { "level": "critical", "sensorType": "pump_temperature", "acknowledged": false, "count": "3" },
  { "level": "warning", "sensorType": "soil_moisture", "acknowledged": true, "count": "12" },
  { "level": "warning", "sensorType": "soil_moisture", "acknowledged": false, "count": "5" }
]
```

---

### 4. GET `/sensor/device/:deviceId/commands`

Command history for a device — both automated (threshold-triggered) and manual.

**Query params:**

| Param | Required | Description |
|-------|----------|-------------|
| source | no | `manual` or `automated` |
| from | no | ISO 8601 start |
| to | no | ISO 8601 end |
| limit | no | Max results (default: 50) |

**Example:**

```bash
# All commands
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/sensor/device/DEVICE_UUID/commands"

# Only automated commands
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/sensor/device/DEVICE_UUID/commands?source=automated&limit=20"
```

**Response:**

```json
[
  {
    "id": "cmd-uuid-1",
    "deviceId": "device-uuid",
    "command": "PUMP_ON",
    "params": { "reason": "Soil moisture below minimum", "sensorType": "soil_moisture", "level": "critical", "value": 15.2, "threshold": 20 },
    "source": "automated",
    "sensorType": "soil_moisture",
    "reason": "Soil moisture below minimum",
    "success": true,
    "errorMessage": null,
    "createdAt": "2026-02-12T10:30:00.000Z"
  },
  {
    "id": "cmd-uuid-2",
    "deviceId": "device-uuid",
    "command": "REBOOT",
    "params": { "force": true },
    "source": "manual",
    "sensorType": null,
    "reason": null,
    "success": true,
    "errorMessage": null,
    "createdAt": "2026-02-12T09:15:00.000Z"
  }
]
```

---

## Farm-Level Endpoints

### 5. GET `/sensor/farm/:farmId/dashboard`

All devices in a farm with their latest sensor readings. Ideal for a farm overview screen.

**Example:**

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/sensor/farm/FARM_UUID/dashboard"
```

**Response:**

```json
[
  {
    "deviceId": "device-uuid-1",
    "name": "Pump Station A",
    "status": "active",
    "latestReadings": [
      { "id": "1001", "deviceId": "device-uuid-1", "sensorType": "water_pressure", "value": 2.8, "createdAt": "2026-02-12T10:29:55Z" },
      { "id": "1002", "deviceId": "device-uuid-1", "sensorType": "pump_temperature", "value": 42.1, "createdAt": "2026-02-12T10:29:55Z" }
    ]
  },
  {
    "deviceId": "device-uuid-2",
    "name": "Irrigation Zone B",
    "status": "active",
    "latestReadings": [
      { "id": "2001", "deviceId": "device-uuid-2", "sensorType": "soil_moisture", "value": 55.3, "createdAt": "2026-02-12T10:28:10Z" }
    ]
  }
]
```

---

### 6. GET `/sensor/farm/:farmId/alerts/overview`

Alert counts across all devices in a farm, grouped by device and level.

**Query params:**

| Param | Required | Description |
|-------|----------|-------------|
| from | no | ISO 8601 start |
| to | no | ISO 8601 end |

**Example:**

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/sensor/farm/FARM_UUID/alerts/overview?from=2026-02-01T00:00:00Z"
```

**Response:**

```json
[
  { "deviceId": "device-uuid-1", "deviceName": "Pump Station A", "level": "critical", "count": "2" },
  { "deviceId": "device-uuid-1", "deviceName": "Pump Station A", "level": "warning", "count": "8" },
  { "deviceId": "device-uuid-2", "deviceName": "Irrigation Zone B", "level": "warning", "count": "3" }
]
```

---

### 7. GET `/sensor/farm/:farmId/comparison`

Compare the same sensor type across all devices in a farm. Useful for identifying outlier devices.

**Query params:**

| Param | Required | Description |
|-------|----------|-------------|
| sensorType | yes | Sensor type enum |
| from | no | ISO 8601 start |
| to | no | ISO 8601 end |

**Example:**

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/sensor/farm/FARM_UUID/comparison?sensorType=soil_moisture&from=2026-02-10T00:00:00Z"
```

**Response:**

```json
[
  { "deviceId": "device-uuid-1", "deviceName": "Pump Station A", "min": 30.2, "max": 68.5, "avg": 48.7, "count": "450" },
  { "deviceId": "device-uuid-2", "deviceName": "Irrigation Zone B", "min": 12.1, "max": 55.0, "avg": 33.2, "count": "420" }
]
```

---

## System-Level Endpoints

### 8. GET `/sensor/system/overview`

High-level system health: device status distribution, alert totals, and recently active devices.

**Example:**

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/sensor/system/overview"
```

**Response:**

```json
{
  "devicesByStatus": [
    { "status": "active", "count": "12" },
    { "status": "paired", "count": "3" },
    { "status": "pending", "count": "1" },
    { "status": "disabled", "count": "2" }
  ],
  "alertsByLevel": [
    { "level": "critical", "count": "5" },
    { "level": "warning", "count": "47" }
  ],
  "activeDevicesLast24h": "10"
}
```

---

## Notes

- **Count values are strings** — PostgreSQL bigint counts are returned as strings from raw queries. Parse with `parseInt()` on the client side.
- **Sensor types:** `water_pressure`, `water_flow`, `pump_temperature`, `soil_moisture`, `electrical_current`.
- **Time buckets:** `hour`, `day`, `week`, `month` — maps directly to PostgreSQL `DATE_TRUNC` intervals.
- **Command sources:** `manual` (sent via mobile/web app) or `automated` (triggered by threshold violations).
- All datetime params accept ISO 8601 format (e.g., `2026-02-12T00:00:00Z`).
- All endpoints are also available on Swagger UI at `/api`.
