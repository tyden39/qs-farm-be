# Code Review: FCM Push Notification

**Date:** 2026-03-03
**Scope:** FCM push notification implementation for NestJS IoT farm platform
**Build:** PASS (no new compile errors introduced)
**Lint:** No new errors introduced by this PR (2 pre-existing errors in unrelated files)

---

## Files Reviewed

**New:**
- `src/notification/entities/device-token.entity.ts`
- `src/notification/enums/platform.enum.ts`
- `src/notification/fcm.service.ts`
- `src/notification/notification.controller.ts`
- `src/notification/notification.module.ts`
- `src/notification/dtos/register-token.dto.ts`

**Modified:**
- `src/app.module.ts`
- `src/sensor/sensor.module.ts`
- `src/sensor/threshold.service.ts`
- `src/sensor/sensor.service.ts`
- `src/schedule/schedule.module.ts`
- `src/schedule/schedule.service.ts`
- `.env.example`
- `.gitignore`

---

## Overall Assessment

The implementation is well-structured and correctly follows the existing codebase conventions (fire-and-forget pattern, anti-spam reuse, graceful degradation). The module wiring, entity design, and the token cleanup strategy are all sound. There are three issues that need attention before merging: one correctness bug, one security issue, and one subtle data integrity race.

---

## Critical Issues

None.

---

## High Priority

### 1. `sendToDevice` uses raw table name string in `innerJoin` - fragile and potentially wrong

**File:** `src/notification/fcm.service.ts`, line 56

```typescript
.innerJoin('farm', 'f', 'f.userId = dt.userId')
```

This uses the raw PostgreSQL table name `'farm'` as a string literal. TypeORM's `createQueryBuilder` `innerJoin` with a string first argument expects a TypeORM entity string alias format (`'EntityName'`) or an entity class, not a raw table name. The actual table is created via `@Entity()` with no explicit table name on the `Farm` entity, which TypeORM lowercases to `farm` — so this works at runtime today. But it is brittle:

- If the `Farm` entity ever adds `@Entity('farms')` or renames, this silently returns no results (no error, no notifications)
- It bypasses TypeORM's metadata, meaning no compile-time safety and no query logging with entity metadata

**Fix — use entity class reference:**
```typescript
import { Farm } from 'src/farm/entities/farm.entity';
// ...
.innerJoin(Farm, 'f', 'f.userId = dt.userId')
```

This binds to TypeORM metadata and survives table renames.

---

### 2. `alertLogId` passed to FCM before `save()` resolves — always undefined

**File:** `src/sensor/threshold.service.ts`, lines 156–179

```typescript
const alertLog = this.alertLogRepo.create({ ... }); // id is undefined here
await this.alertLogRepo.save(alertLog);              // id populated after this

this.fcmService.sendToDevice(deviceId, farmId, {
  data: {
    alertLogId: alertLog.id,  // CORRECT: save() is awaited above
  },
})
```

On re-reading: `save()` is awaited before the FCM call, so `alertLog.id` is populated by TypeORM after the DB insert. This is actually correct. However, `alertLog.id` is typed as `string` (UUID from `@PrimaryGeneratedColumn('uuid')`) but is passed into `data: Record<string, string>` which is fine.

**This is a false alarm — no issue here.**

---

### 3. Path traversal risk via `FIREBASE_SERVICE_ACCOUNT_PATH` + dynamic `require()`

**File:** `src/notification/fcm.service.ts`, lines 25–36

```typescript
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
// ...
const serviceAccount = require(serviceAccountPath);
```

`require()` with a user-controlled path is a path traversal vector in general, but here the path comes from an env var set by the server operator (not a user request). The risk is low in production but worth noting:

- If the env var is ever settable via an admin UI or config injection attack, an attacker could `require()` any JSON file on the filesystem (e.g., `/etc/passwd` would fail JSON parse, but a valid JSON config file would be loaded silently)
- `require()` also caches the module — if the file changes on disk, the service will keep the old credentials until restart

**Preferred fix — use `fs.readFileSync` + `JSON.parse` with explicit path validation:**
```typescript
import * as fs from 'fs';
import * as path from 'path';

const resolvedPath = path.resolve(serviceAccountPath);
const serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
```

This makes the intent explicit (read JSON file, not load Node module) and avoids module caching. Path validation via `path.resolve` makes relative paths safe relative to CWD.

---

## Medium Priority

### 4. `sendToDevice` `deviceId` parameter is unused in the query — misleading signature

**File:** `src/notification/fcm.service.ts`, lines 49–61

```typescript
async sendToDevice(
  deviceId: string,   // <-- never used in the query
  farmId: string,
  notification: FcmNotification,
): Promise<void> {
  const tokens = await this.deviceTokenRepo
    .createQueryBuilder('dt')
    .innerJoin('farm', 'f', 'f.userId = dt.userId')
    .where('f.id = :farmId', { farmId })
    .getMany();
```

The method is named `sendToDevice` and takes `deviceId` but sends to all users of the farm (not just the device owner). The `deviceId` is only used by callers to pass to the FCM `data` payload (which happens at the call site, not inside this method). The `deviceId` parameter in the method signature is dead code.

The method is also called with `schedule.deviceId || 'farm'` in schedule.service.ts — the string `'farm'` gets passed as deviceId when it's a farm-wide schedule. This is harmless since `deviceId` is ignored in the query, but it is confusing.

**Two options:**
1. Remove `deviceId` from the signature if it's intentionally not used in routing
2. Rename to `sendToFarm(farmId, notification)` to match actual semantics

---

### 5. `NotificationController` injects repository directly — bypasses service layer

**File:** `src/notification/notification.controller.ts`, lines 9–25

```typescript
constructor(
  @InjectRepository(DeviceToken)
  private readonly deviceTokenRepo: Repository<DeviceToken>,
) {}
```

The controller directly uses `@InjectRepository` instead of injecting `FcmService`. This is inconsistent with the project pattern (all other controllers delegate to a service). It also means:
- The upsert logic in `registerToken` cannot be unit-tested without TypeORM setup
- If token registration ever needs FCM-side validation (e.g., call Firebase to verify token validity), there's no service to add it to

**Fix:** Move `registerToken` and `unregisterToken` logic into `FcmService` (or a dedicated `NotificationService`) and inject that into the controller.

---

### 6. `reason` can be `undefined` in FCM notification body

**File:** `src/sensor/threshold.service.ts`, lines 82–86, 163

```typescript
const reasonMap = SENSOR_REASON_MAP[sensorType];
const reason =
  direction === AlertDirection.BELOW
    ? reasonMap?.belowMin
    : reasonMap?.aboveMax;
// ...
body: reason,  // could be undefined if sensorType not in SENSOR_REASON_MAP
```

If `sensorType` is not in `SENSOR_REASON_MAP`, `reason` is `undefined`. The FCM payload `body: undefined` will result in a notification with no body text on the mobile client. FCM silently accepts it (won't error), but users see an empty notification body.

**Fix:** Provide a fallback:
```typescript
body: reason ?? `${sensorType} alert (${direction})`,
```

---

### 7. Schedule FCM call passes `schedule.deviceId || 'farm'` as deviceId

**File:** `src/schedule/schedule.service.ts`, line 255

```typescript
this.fcmService
  .sendToDevice(schedule.deviceId || 'farm', farmId, {
```

When `schedule.deviceId` is null (farm-level schedule), the string literal `'farm'` is passed as `deviceId`. Since `sendToDevice` ignores the `deviceId` parameter (see issue #4), this is harmless today. But if `sendToDevice` is ever fixed to use `deviceId`, this will break farm-level schedule notifications. Should be `null` or `undefined` or the parameter should be removed.

---

## Low Priority

### 8. `RegisterTokenDto` missing `@IsNotEmpty()` on token field

**File:** `src/notification/dtos/register-token.dto.ts`

```typescript
@IsString()
token: string;
```

`@IsString()` passes for empty string `""`. An empty token would be inserted into the DB (unique column) and cause problems on send. Add `@IsNotEmpty()`:

```typescript
@IsString()
@IsNotEmpty()
token: string;
```

---

### 9. `sendToUser` method is dead code

**File:** `src/notification/fcm.service.ts`, lines 40–47

`sendToUser` is defined but never called anywhere in the codebase. Per YAGNI, remove it unless there's a concrete plan to use it.

---

### 10. `@Delete` with request body is non-standard HTTP

**File:** `src/notification/notification.controller.ts`, line 51

```typescript
@Delete('unregister-token')
async unregisterToken(@CurrentUser() user: any, @Body() dto: RegisterTokenDto) {
```

HTTP DELETE with a body is technically valid but many proxies, CDNs, and HTTP clients drop or reject DELETE bodies. A safer pattern is either:
- `DELETE /notification/token/:token` (token in path param)
- `POST /notification/unregister-token` (semantic not REST-pure but reliable)

---

### 11. `CurrentUser` typed as `any`

**File:** `src/notification/notification.controller.ts`, lines 30, 54

```typescript
@CurrentUser() user: any,
```

Other controllers in the codebase use the same `any` pattern, so this is consistent. However, since `user.id` is relied on for token ownership, a typed `{ id: string }` interface would prevent silent failures if JWT payload shape changes.

---

## Edge Cases Found by Scout

- **FCM disabled + alertLog already saved**: If `initialized = false`, `sendToTokens` returns early silently. The alert is still logged and WebSocket alert is broadcast — correct behavior, graceful degradation works as designed.
- **Farm-level schedule with many devices**: If `deviceService.findOne(schedule.deviceId)` is called after `execute()` returns early (on command failure), `farmId` is never fetched and no FCM notification fires. This is correct per the early-return design (don't notify if execution failed).
- **Token cleanup race**: If two concurrent alerts for the same device trigger `sendToTokens` simultaneously, both may attempt to delete the same invalid tokens. The `DELETE WHERE token IN (...)` is idempotent — second call deletes 0 rows, no error.
- **`onModuleInit` with multiple instances**: If NestJS ever runs in cluster mode, `admin.initializeApp()` is called once per process — correct. But if `FcmService` is somehow instantiated twice (e.g., accidental module re-import), `admin.initializeApp()` would throw "Firebase App named '[DEFAULT]' already exists." The `initialized` flag would not protect against this because each instance has its own flag. Consider checking `admin.apps.length` before initializing.
- **`alertLog.id` in FCM `data`**: All FCM `data` values must be strings. `alertLog.id` is a UUID string — fine. `threshold.level` is an enum string — fine. Checked all fields in `data` objects; no type mismatches.

---

## Positive Observations

- Graceful degradation (`initialized` flag) is well implemented — server starts fine without Firebase credentials
- Fire-and-forget pattern (`.catch()` without `await`) correctly prevents FCM failures from blocking the alert/schedule critical path
- Anti-spam reuse via `ThresholdService.shouldDispatch()` — FCM notifications inherit the 30s cooldown automatically, no duplicate logic
- Token cleanup on failure is reactive and correct — no need for a cron job
- `.gitignore` pattern `*-firebase-adminsdk-*.json` correctly excludes the standard Firebase service account filename
- `@Entity('device_token')` explicit table name is good practice (avoids TypeORM default pluralization surprises)
- Upsert on `registerToken` (same token, different user) handles device account switching correctly

---

## Recommended Actions (Prioritized)

1. **[High]** Fix `innerJoin('farm', ...)` to use the `Farm` entity class to prevent silent query breakage on entity rename
2. **[High]** Resolve `FIREBASE_SERVICE_ACCOUNT_PATH` path handling — switch from `require()` to `fs.readFileSync + JSON.parse`
3. **[Medium]** Remove unused `deviceId` parameter from `sendToDevice` or rename method to `sendToFarm` to match actual semantics; fix schedule.service.ts call site accordingly
4. **[Medium]** Move token repo logic from controller into `FcmService` or a `NotificationService`
5. **[Medium]** Add fallback for undefined `reason` in FCM notification body
6. **[Low]** Add `@IsNotEmpty()` to `RegisterTokenDto.token`
7. **[Low]** Remove unused `sendToUser` method (YAGNI)
8. **[Low]** Consider `admin.apps.length` guard in `onModuleInit` for future cluster safety

---

## Metrics

- Type Coverage: Good — no new `any` beyond existing codebase pattern
- Linting: 0 new errors introduced (2 pre-existing errors in unrelated files remain)
- Build: Clean compilation
- Test Coverage: No new tests added (existing codebase has no tests for notification path)

---

## Unresolved Questions

- Is `sendToUser` planned for a future feature (e.g., user-targeted admin notifications)? If so, a comment explaining intent would prevent it from being removed as dead code.
- Should schedule execution notifications fire even when command dispatch fails (partial failure on farm-wide schedules)? Currently the early `return` on error skips the notification entirely.
- Is there a rate limit plan for FCM beyond the inherited 30s anti-spam? Firebase has per-project FCM quotas; if a farm has many devices each with many sensors, the quotas could be hit.
