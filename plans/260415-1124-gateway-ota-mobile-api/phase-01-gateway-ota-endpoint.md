# Phase 1: Gateway OTA Mobile Endpoint

**Priority:** High | **Effort:** Small | **Status:** Complete

## Context Links

- [Plan Overview](./plan.md)
- [src/firmware/firmware.service.ts:415-447](../../src/firmware/firmware.service.ts#L415-L447) — existing `deployToGateways()`
- [src/firmware/firmware.controller.ts:120-125](../../src/firmware/firmware.controller.ts#L120-L125) — existing `deploy()` endpoint (pattern reference)
- [src/firmware/firmware.service.ts:356-380](../../src/firmware/firmware.service.ts#L356-L380) — existing `deployForUser()` (ownership pattern)
- [src/gateway/gateway.service.ts:132-134](../../src/gateway/gateway.service.ts#L132-L134) — `findByFarm()`
- [src/farm/farm.service.ts](../../src/farm/farm.service.ts) — `findOne()` returns `{ userId }`

## Overview

Thêm REST endpoint cho mobile app trigger firmware OTA cho gateway, với ownership check qua farm + require published firmware. Wrap existing `deployToGateways()` với validation layer.

## Requirements

### Functional
- Endpoint `POST /firmware/:id/deploy-gateways` protected bằng `JwtAuthGuard`.
- Body accept: `{ gatewayIds?: string[] }` **hoặc** `{ farmId?: string }` (chỉ 1 trong 2, giống pattern `DeployFirmwareDto`).
- Response sync: `{ firmwareId, version, results: [{ gatewayId, logId, status }] }`.
- Require `firmware.isPublished === true` → nếu false trả `400 BadRequestException("Firmware not published")`.
- Ownership: mọi `gatewayId` trong request phải thuộc farm mà `farm.userId === currentUserId`. Non-owner → `403 ForbiddenException`.

### Non-functional
- Reuse `FirmwareService.deployToGateways()` không sửa đổi (DRY).
- Không thay đổi behavior của WebSocket flow `handleMobileUpdateRequest()` (đã dùng được).

## Related Code Files

**Modify:**
- [src/firmware/dto/deploy-firmware.dto.ts](../../src/firmware/dto/deploy-firmware.dto.ts) — thêm `gatewayIds?: string[]`
- [src/firmware/firmware.controller.ts](../../src/firmware/firmware.controller.ts) — thêm `@Post(':id/deploy-gateways')` handler
- [src/firmware/firmware.service.ts](../../src/firmware/firmware.service.ts) — thêm `deployGatewaysForUser(firmwareId, dto, userId)`

**Read (no edit):**
- [src/gateway/gateway.service.ts](../../src/gateway/gateway.service.ts) — `findOne`, `findByFarm`
- [src/farm/farm.service.ts](../../src/farm/farm.service.ts) — `findOne` (ownership)
- [src/gateway/entities/gateway.entity.ts](../../src/gateway/entities/gateway.entity.ts) — `farmId`

## Implementation Steps

### 1. Extend `DeployFirmwareDto`

File: [src/firmware/dto/deploy-firmware.dto.ts](../../src/firmware/dto/deploy-firmware.dto.ts)

Thêm field `gatewayIds` (optional UUID array) song song với `deviceIds` và `farmId`:

```typescript
@ApiProperty({ required: false, type: [String] })
@IsOptional()
@IsArray()
@IsUUID('4', { each: true })
gatewayIds?: string[];
```

### 2. Thêm `deployGatewaysForUser()` trong `FirmwareService`

File: [src/firmware/firmware.service.ts](../../src/firmware/firmware.service.ts)

```typescript
async deployGatewaysForUser(
  firmwareId: string,
  dto: DeployFirmwareDto,
  userId: string,
) {
  const firmware = await this.findOne(firmwareId);
  if (!firmware.isPublished) {
    throw new BadRequestException('Firmware not published');
  }

  let gatewayIds: string[];

  if (dto.farmId) {
    const farm = await this.farmService.findOne(dto.farmId);
    if (farm.userId !== userId) {
      throw new ForbiddenException('You do not own this farm');
    }
    const gateways = await this.gatewayService.findByFarm(dto.farmId);
    gatewayIds = gateways.map((g) => g.id);
  } else if (dto.gatewayIds?.length) {
    for (const gwId of dto.gatewayIds) {
      const gateway = await this.gatewayService.findOne(gwId);
      if (!gateway.farmId) {
        throw new ForbiddenException(`Gateway ${gwId} not paired to any farm`);
      }
      const farm = await this.farmService.findOne(gateway.farmId);
      if (farm.userId !== userId) {
        throw new ForbiddenException(`Gateway ${gwId} not owned by you`);
      }
    }
    gatewayIds = dto.gatewayIds;
  } else {
    throw new BadRequestException('Provide gatewayIds or farmId');
  }

  if (gatewayIds.length === 0) {
    return { firmwareId: firmware.id, version: firmware.version, results: [] };
  }

  return this.deployToGateways(firmwareId, gatewayIds);
}
```

**Notes:**
- `deployToGateways()` hiện `private` → đổi thành `public` (hoặc gọi qua wrapper vẫn OK, vì cùng class).
- Reuse `this.gatewayService` (đã inject từ `GatewayModule`).

### 3. Thêm controller endpoint

File: [src/firmware/firmware.controller.ts](../../src/firmware/firmware.controller.ts)

```typescript
@Post(':id/deploy-gateways')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
async deployGateways(
  @Param('id') id: string,
  @Body() dto: DeployFirmwareDto,
  @CurrentUser() user: any,
) {
  return this.firmwareService.deployGatewaysForUser(id, dto, user.id);
}
```

### 4. Optional: refactor WebSocket handler để reuse

`handleMobileUpdateRequest()` đang gọi `deployToGateways(firmwareId, gatewayIds)` **không qua ownership check**. Nên đổi sang `deployGatewaysForUser()` để consistent security posture giữa REST và WebSocket.

Chỉ update 1 dòng trong [src/firmware/firmware.service.ts:394](../../src/firmware/firmware.service.ts#L394):
```typescript
// before
const result = await this.deployToGateways(data.firmwareId, data.gatewayIds);
// after
const result = await this.deployGatewaysForUser(
  data.firmwareId,
  { gatewayIds: data.gatewayIds },
  data.userId,
);
```

### 5. Compile + lint

```bash
yarn build
yarn lint
```

## Todo

- [x] Extend `DeployFirmwareDto` với `gatewayIds`
- [x] Implement `FirmwareService.deployGatewaysForUser()`
- [x] Giữ `deployToGateways()` private (gọi qua wrapper cùng class)
- [x] Add `POST /firmware/:id/deploy-gateways` trong controller
- [x] Refactor `handleMobileUpdateRequest()` dùng `deployGatewaysForUser()` để unified security
- [x] `yarn build` — pass
- [ ] Test manual: pair gateway, publish firmware, POST endpoint với valid token + owned gateway → expect 200
- [ ] Test manual: POST với gateway không thuộc user → expect 403
- [ ] Test manual: POST với firmware chưa publish → expect 400
- [ ] Test manual: POST với body trống → expect 400

## Success Criteria

- Mobile app call `POST /firmware/:id/deploy-gateways` với body `{ gatewayIds }` hoặc `{ farmId }` → MQTT publish tới `gateway/{id}/ota` → response chứa `results[]` với `status: 'sent'` hoặc `'failed'`.
- `FirmwareUpdateLog` ghi nhận 1 record per gateway với `gatewayId` + `firmwareVersion` + `status: pending`.
- Ownership violation trả 403 với message rõ ràng.
- Unpublished firmware trả 400.
- Không regression flow WebSocket `requestFirmwareUpdate`.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| `deployToGateways` đang publish MQTT không check gateway online | Out-of-scope phase này. Log `pending` sẽ tự resolve khi gateway ack (hoặc remain pending nếu offline). Có thể thêm TTL log sau. |
| Sequential ownership check khi `gatewayIds` dài | Acceptable: n<50, check mỗi gateway 1 query. Nếu scale hơn thì batch query sau. |
| Circular dep `FirmwareModule ↔ GatewayModule` | Đã ok: `FirmwareModule` import `GatewayModule`, không ngược lại. |

## Security Considerations

- **JwtAuthGuard** ở REST endpoint — `userId` từ token.
- **Ownership chain:** `gateway.farmId` → `farm.userId` === current user.
- **Publish gate:** prevent user trigger unreleased firmware (VD: internal test build).
- **No rate limit** phase này — acceptable vì deploy tốn ít tài nguyên server, nhưng thêm `@Throttle()` sau nếu cần.

## Next Steps

- Sau khi merge, cần update doc mobile API (nếu có OpenAPI export).
- Cân nhắc emit WebSocket event `gatewayFirmwareDeploying` tương tự `firmwareDeploying` của device (hiện `deployToGateways` không emit) — follow-up phase.
