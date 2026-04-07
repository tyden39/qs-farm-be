# Phase 03 — EmqxModule Gateway Auth/ACL

## Overview

- **Priority:** P1
- **Status:** complete
- **Effort:** 1h
- **Depends on:** Phase 02 (Gateway entity phải tồn tại)

Extend `EmqxService` để authenticate gateway và kiểm tra ACL. Gateway dùng username `gateway:{gwId}` + `mqttToken`.

## Key Insights

- Pattern giống device: `device:{deviceId}` → `gateway:{gwId}`
- Gateway ACL rộng hơn device vì phải forward cho nhiều devices (wildcard `device/+/*`)
- Không cần tạo endpoint mới — chỉ thêm case vào `authenticate()` và `checkAcl()`
- Gateway chỉ được truy cập topics liên quan farm của nó — nhưng để đơn giản, wildcard là đủ (gateway firmware chỉ biết devices của nó)

## ACL Rules

```
Gateway publish được:
  device/+/telemetry
  device/+/status
  device/+/resp
  provision/new              ← forward device provision
  provision/gateway/new      ← self provision (anonymous, trước khi pair)
  gateway/{gwId}/status      ← heartbeat

Gateway subscribe được:
  device/+/cmd               ← nhận command, filter trong firmware
  provision/resp/+           ← forward provision response về device
  provision/gateway/resp/+   ← nhận own credentials sau pair
  gateway/{gwId}/ota         ← nhận gateway firmware update
  gateway/{gwId}/device-ota  ← nhận trigger device OTA
```

## Related Files

**Modify:**
- `src/emqx/emqx.service.ts` — thêm gateway auth + ACL cases
- `src/emqx/emqx.module.ts` — inject GatewayRepository

## Implementation Steps

### 1. Inject GatewayRepository vào EmqxModule

File: `src/emqx/emqx.module.ts`

```typescript
imports: [
  TypeOrmModule.forFeature([Device, Farm, Gateway]),  // thêm Gateway
  ...
]
```

### 2. Thêm gateway auth vào `authenticate()`

File: `src/emqx/emqx.service.ts`

```typescript
// Sau Case 1 (device auth), trước Case 2 (user JWT):
// Case 1.5: Gateway authentication
// username format: gateway:{gatewayId}
if (username.startsWith('gateway:')) {
  const gwId = username.replace('gateway:', '');
  const gateway = await this.gatewayRepository.findOne({ where: { id: gwId } });

  if (!gateway?.mqttToken || gateway.status === GatewayStatus.DISABLED) {
    this.logger.warn(`Gateway auth failed: ${gwId}`);
    return false;
  }

  const ok = gateway.mqttToken === password;
  if (ok) this.logger.log(`Gateway authenticated: ${gwId}`);
  return ok;
}
```

### 3. Thêm gateway ACL vào `checkAcl()`

```typescript
// Thêm vào đầu checkAcl():
if (username.startsWith('gateway:')) {
  return this.checkGatewayAcl(username, topic, access);
}
```

```typescript
private checkGatewayAcl(username: string, topic: string, access: number): boolean {
  const gwId = username.replace('gateway:', '');

  // PUBLISH (access = 2)
  if (access === 2) {
    return (
      topic.startsWith('device/')        ||  // telemetry/status/resp của devices
      topic === 'provision/new'          ||  // forward device provision
      topic === 'provision/gateway/new'  ||  // self provision
      topic === `gateway/${gwId}/status`     // heartbeat
    );
  }

  // SUBSCRIBE (access = 1)
  if (access === 1) {
    return (
      topic.startsWith('device/')               ||  // cmd wildcard
      topic.startsWith('provision/resp/')       ||  // device provision resp
      topic.startsWith('provision/gateway/resp/')||  // own credentials
      topic === `gateway/${gwId}/ota`           ||  // gateway OTA
      topic === `gateway/${gwId}/device-ota`        // device OTA trigger
    );
  }

  return false;
}
```

### 4. Anonymous provision/gateway/new

EMQX cần cho phép publish `provision/gateway/new` mà không cần credentials (giống `provision/new` của device). Kiểm tra EMQX config hiện tại có allow anonymous hay không — nếu không, cần handle trong `authenticate()` khi username trống.

> Nếu EMQX đang dùng `allow_anonymous = false` (default), cần thêm case xử lý anonymous hoặc dùng dedicated provision credentials (serial/nonce làm username/password tạm thời).

## Todo

- [x] Inject `Gateway` entity vào `emqx.module.ts`
- [x] Thêm gateway auth case vào `authenticate()`
- [x] Thêm `checkGatewayAcl()` private method
- [x] Gọi `checkGatewayAcl()` trong `checkAcl()`
- [x] Kiểm tra EMQX anonymous setting cho `provision/gateway/new`
- [x] Compile check: `yarn build`

## Success Criteria

- Gateway connect EMQX với `gateway:{gwId}` + `mqttToken` → authenticated
- Gateway publish `device/abc/telemetry` → ACL pass
- Gateway subscribe `device/+/cmd` → ACL pass
- Device (username `device:xxx`) không subscribe được `gateway/+/*` → ACL deny
- User token không publish được `device/+/telemetry` (chỉ publish cmd)

## Risk

- EMQX `allow_anonymous` setting — cần verify môi trường hiện tại
- ACL wildcard `device/+` khá rộng — gateway có thể forward bất kỳ device nào, không giới hạn theo farm. Chấp nhận được vì gateway firmware chỉ biết devices của nó qua NVS registry.
