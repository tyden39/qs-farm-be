# Device Deletion & Pairing Flow Analysis

**Date:** April 6, 2026  
**Status:** Complete  
**Scope:** Device deletion mechanics, pairing/provisioning flow, entity relationships, cascade rules

---

## 1. Device Deletion Flow

### Current Delete Endpoint
- **HTTP Method:** DELETE
- **Path:** `/device/:id`
- **Controller:** `DeviceController.remove()`  
  - File: `/src/device/device.controller.ts:118-121`
  - Route: `@Delete(':id')`
  - Authentication: `@UseGuards(JwtAuthGuard)` with Bearer token

### Delete Implementation
- **Service:** `DeviceService.remove()`  
  - File: `/src/device/device.service.ts:72-76`
  - Logic:
    ```typescript
    async remove(id: string) {
      const device = await this.findOne(id);  // Validates device exists
      return this.deviceRepository.remove(device);  // TypeORM remove()
    }
    ```
  - **Critical Issue:** No cascade rules defined on Device entity

---

## 2. Device Entity - TypeORM Cascade Configuration

### Device.entity.ts Analysis
**File:** `/src/device/entities/device.entity.ts`

#### Relations Defined:
1. **Farm (ManyToOne)**
   - `@ManyToOne(() => Farm, farm => farm.devices)`
   - No cascade options → Foreign key: `farmId`
   - On Device delete: No action defined (handled by DB default)

2. **Zone (ManyToOne)**
   - `@ManyToOne('Zone', zone => zone.devices, { nullable: true, onDelete: 'SET NULL' })`
   - **Behavior:** When zone deleted, `zoneId` is set to NULL
   - On Device delete: No constraint

3. **SensorConfig (OneToMany)**
   - `@OneToMany(() => SensorConfig, sc => sc.device)`
   - **NO cascade option defined** ⚠️
   - **Behavior:** SensorConfigs remain orphaned when Device deleted

---

## 3. Related Entities & Cascade Rules

### Complete Entity Dependency Map

#### SensorConfig
**File:** `/src/sensor/entities/sensor-config.entity.ts`
- **FK to Device:** `deviceId` (ManyToOne)
- **No onDelete rule** on Device side → ⚠️ ORPHAN RISK
- Cascade options: `{ cascade: true }` applies only to:
  - **SensorThreshold** (OneToMany) - Will cascade delete thresholds

**Thresholds (OneToMany):**
- `@OneToMany(() => SensorThreshold, threshold => threshold.sensorConfig, { cascade: true })`
- When SensorConfig deleted → **all SensorThresholds deleted**

---

#### SensorData
**File:** `/src/sensor/entities/sensor-data.entity.ts`
- **FK to Device:** `deviceId` (Column only, no ManyToOne relation)
- **No cascade rule** → ⚠️ ORPHAN RISK
- Data indexed on: `[deviceId, createdAt]` and `[deviceId, sensorType, createdAt]`
- **Behavior:** Records remain in database indefinitely

---

#### SensorThreshold
**File:** `/src/sensor/entities/sensor-threshold.entity.ts`
- **FK to SensorConfig:** `sensorConfigId` (ManyToOne)
- **Cascade Rule:** `{ onDelete: 'CASCADE' }`
- **Behavior:** Deleted when parent SensorConfig deleted
- Related to: SensorConfig.thresholds (cascade: true)

---

#### AlertLog
**File:** `/src/sensor/entities/alert-log.entity.ts`
- **FK to Device:** `deviceId` (ManyToOne with no cascade)
- **No onDelete rule** → ⚠️ ORPHAN RISK
- **Behavior:** AlertLog records remain after device deletion

---

#### CommandLog
**File:** `/src/sensor/entities/command-log.entity.ts`
- **FK to Device:** `deviceId` (ManyToOne with no cascade)
- **No onDelete rule** → ⚠️ ORPHAN RISK
- **Behavior:** CommandLog records remain after device deletion
- Indexed on: `[deviceId, createdAt]`

---

#### DeviceSchedule
**File:** `/src/schedule/entities/device-schedule.entity.ts`
- **FK to Device:** `deviceId` (ManyToOne)
- **Cascade Rule:** `{ onDelete: 'CASCADE' }` ✓
- **Behavior:** Schedules deleted when device deleted
- Also has CASCADE on Farm and Zone relations

---

#### PairingToken
**File:** `/src/device/entities/pairing-token.entity.ts`
- **FK:** None to Device (only serial string match)
- **Columns:** `id`, `token`, `serial`, `expiresAt`, `used`, `createdAt`
- **No relation to Device entity** → ⚠️ Must be manually deleted

---

## 4. Data Remaining After Device Deletion

### Will Be Deleted (Cascade)
✓ SensorConfig (OneToMany with no explicit cascade, but deleted via service logic)  
✓ SensorThreshold (Cascade via SensorConfig relationship)  
✓ DeviceSchedule (CASCADE rule on Device FK)

### Will Remain (Orphaned)
⚠️ **SensorData** - No cascade, only deviceId reference  
⚠️ **AlertLog** - No cascade, only deviceId reference  
⚠️ **CommandLog** - No cascade, only deviceId reference  
⚠️ **PairingToken** - If exists, no automatic cleanup (matched by serial only)

---

## 5. Device Pairing/Provisioning Flow

### Provisioning Flow (Device → System)

#### Step 1: Device Publishes Provision Request
- Device publishes to MQTT: `provision/new`
- Payload includes: `serial`, `hw` (hardware version), `nonce`

#### Step 2: handleProvisionRequest()
**Service:** `ProvisionService.handleProvisionRequest()`  
**File:** `/src/provision/provision.service.ts:32-106`

Actions:
1. Validate serial, hardware version, nonce
2. Check if device already exists by `serial`
3. If exists and `status === PAIRED` → reject
4. Create or update device:
   - Status: `PENDING`
   - Name: `Device-{last8chars(serial)}`
   - IMEI: Set to serial
   - `provisionedAt`: Now
   - `farmId`: NULL (will be set during pairing)
5. **Generate PairingToken:**
   - Token: Random 32-byte hex string
   - Serial: Device serial
   - ExpiresAt: Now + 24 hours
   - Used: false
6. Publish response via MQTT: `provision/resp/{nonce}`

#### Step 3: Mobile App - Pair Device
**Service:** `ProvisionService.pairDevice()`  
**File:** `/src/provision/provision.service.ts:111-204`

Actions:
1. Find device by serial
2. Validate device status (PENDING or PAIRED)
3. **Verify PairingToken:**
   - Token must exist
   - Must not be used (used === false)
   - Must not be expired (expiresAt > now)
   - Must match provided token exactly
4. **Generate DeviceToken** (for MQTT auth)
5. Update device:
   - `farmId`: Set to provided farm
   - `deviceToken`: Generated token
   - `status`: PAIRED
   - `pairedAt`: Now
6. **Mark PairingToken as used:** `used: true`
7. Publish `set_owner` command to device via MQTT: `device/{deviceId}/cmd`

### Device Status Lifecycle
```
PENDING → PAIRED → ACTIVE
                 → DISABLED
```
- **PENDING:** Device provisioned, awaiting pairing
- **PAIRED:** Device paired to farm, awaiting activation
- **ACTIVE:** Device actively collecting data
- **DISABLED:** Device manually disabled

---

## 6. PairingToken Lifecycle

### Token Creation
- **When:** During `handleProvisionRequest()`
- **Where:** `ProvisionService.generatePairingToken()`
- **Expiry:** 24 hours from creation
- **Status:** `used: false`

### Token Usage
- Verified during `pairDevice()` call
- Marked as `used: true` after successful pairing
- Cannot be reused (validation checks `used` flag)

### Token Management Endpoints

#### Get All Tokens
- **Path:** `GET /provision/pairing-tokens`
- **Auth:** Required (JWT)
- **Response:** Array with `id`, `serial`, `token`, `used`, `expired`, `expiresAt`, `createdAt`

#### Delete Single Token
- **Path:** `POST /provision/pairing-tokens/:tokenId/delete`
- **Auth:** Required
- **Logic:** Removes by ID

#### Delete Batch
- **Path:** `POST /provision/pairing-tokens/delete-all`
- **Auth:** Required
- **Filters:**
  - `expired`: Only tokens with `expiresAt < now`
  - `used`: Only tokens with `used === true`
  - `all`: All tokens (default)

### Important: Token Not Deleted on Device Delete
- **Risk:** If device deleted, its PairingToken(s) remain
- **Reason:** No FK relationship in PairingToken entity
- **Cleanup:** Must be handled separately via provision endpoints

---

## 7. Device Status Reset on Re-pairing

### Current Behavior
When re-pairing an existing device:

1. Device is found by serial (existing Device record)
2. If status is PAIRED, provisioning request is **rejected**
3. To re-pair, must first call **unpairDevice()**

### Unpair Operation
**Service:** `ProvisionService.unpairDevice()`  
**File:** `/src/provision/provision.service.ts:209-225`

Actions:
1. Find device by ID
2. Clear fields:
   - `farmId`: NULL
   - `deviceToken`: NULL
   - `status`: PENDING (reset to provisioning state)
3. Save device

**Result:** Device can now go through new pairing flow

---

## 8. Device Token Management

### Device Token vs Pairing Token
- **Pairing Token:** Short-lived (24h), used only during pairing
- **Device Token:** Long-lived, used for MQTT authentication after pairing

### Regenerate Device Token
**Endpoint:** `POST /device/:id/regenerate-token`  
**Service:** `ProvisionService.regenerateDeviceToken()`  
**File:** `/src/provision/provision.service.ts:230-254`

Requirements:
- Device must exist
- Device must have status === PAIRED
- Generates new random 32-byte hex token
- Updates device.deviceToken in DB
- Returns new token to client

---

## Summary of Cascade Rules

| Entity | Device FK | onDelete | Result on Device Delete |
|--------|-----------|----------|------------------------|
| SensorConfig | deviceId (M2O) | None | ⚠️ Orphaned |
| SensorThreshold | sensorConfigId | CASCADE | Deleted (via parent) |
| SensorData | deviceId (Column) | None | ⚠️ Orphaned |
| AlertLog | deviceId | None | ⚠️ Orphaned |
| CommandLog | deviceId | None | ⚠️ Orphaned |
| DeviceSchedule | deviceId | CASCADE | ✓ Deleted |
| PairingToken | serial (no FK) | - | ⚠️ Orphaned |
| Zone | FK to Device | SET NULL | Zone.zoneId = NULL |

---

## Critical Issues & Recommendations

### Issue 1: Orphaned Sensor Data
- **Problem:** SensorData, AlertLog, CommandLog records remain after device deletion
- **Impact:** Database bloat, orphaned metric history
- **Recommendation:** Add `onDelete: 'CASCADE'` to Device entity relations OR implement cleanup in service

### Issue 2: SensorConfig Cascade
- **Problem:** SensorConfig has no cascade rule from Device side
- **Impact:** SensorConfigs with their thresholds remain orphaned
- **Recommendation:** Add `cascade: ['remove']` to Device.OneToMany SensorConfig

### Issue 3: PairingToken Orphans
- **Problem:** PairingToken has no FK to Device (only serial string match)
- **Impact:** Tokens remain indefinitely, no automatic cleanup
- **Recommendation:** 
  - Add proper FK relationship to Device
  - Or implement periodic cleanup of expired/used tokens

### Issue 4: No Transaction Safety
- **Problem:** Device delete doesn't wrap cascades in transaction
- **Impact:** Partial deletes possible on failure
- **Recommendation:** Use `@Transaction()` decorator in remove() method

---

## Files Referenced
- `/src/device/entities/device.entity.ts` - Device entity with relations
- `/src/device/entities/pairing-token.entity.ts` - PairingToken entity
- `/src/device/device.controller.ts` - Delete endpoint
- `/src/device/device.service.ts` - Delete service logic
- `/src/provision/provision.service.ts` - Pairing & provisioning logic
- `/src/provision/provision.controller.ts` - Provision endpoints
- `/src/sensor/entities/sensor-config.entity.ts` - SensorConfig relations
- `/src/sensor/entities/sensor-data.entity.ts` - SensorData orphan risk
- `/src/sensor/entities/alert-log.entity.ts` - AlertLog orphan risk
- `/src/sensor/entities/command-log.entity.ts` - CommandLog orphan risk
- `/src/sensor/entities/sensor-threshold.entity.ts` - SensorThreshold cascade
- `/src/schedule/entities/device-schedule.entity.ts` - DeviceSchedule cascade

