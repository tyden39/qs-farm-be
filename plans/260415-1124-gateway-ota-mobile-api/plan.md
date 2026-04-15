---
name: Gateway OTA Mobile API
date: 2026-04-15
status: complete
branch: master
blockedBy: []
blocks: []
---

# Gateway Firmware Upgrade — Mobile REST API

## Overview

Mobile app cần trigger firmware upgrade cho **LoRa gateway** qua REST API (hiện chỉ có flow cho device, và flow gateway mới chỉ expose qua WebSocket `requestFirmwareUpdate` + `gatewayIds`). Thêm 1 endpoint mới `POST /firmware/:id/deploy-gateways` với ownership check qua farm.

## Scope Quyết Định (đã chốt)

| Topic | Quyết định |
|---|---|
| Target | DTO nhận `gatewayIds?: string[]` **hoặc** `farmId?: string` (giống pattern `DeployFirmwareDto`) |
| Ownership | Qua `gateway.farmId → farm.userId === currentUserId`; nếu `farmId` → check `farm.userId` |
| Response | **Sync waiting** — trả `results` sau khi MQTT publish xong (<200ms) |
| Publish gate | Yêu cầu `firmware.isPublished === true`; nếu không → `BadRequestException` |

## Current State (đã có sẵn)

- `FirmwareService.deployToGateways(firmwareId, gatewayIds[])` — publish MQTT `gateway/{gwId}/ota` + tạo `FirmwareUpdateLog` per gateway. ✅
- `FirmwareService.handleMobileUpdateRequest()` — entry point qua WebSocket event `firmware.update.requested`. ✅ (giữ nguyên)
- `Gateway.farmId` + `Farm.userId` — ownership chain. ✅
- `FirmwareUpdateLog.gatewayId` nullable — log schema sẵn sàng. ✅
- `FarmModule` + `GatewayModule` đã import trong `FirmwareModule`. ✅

## Gap

1. Không có REST endpoint cho mobile trigger gateway OTA.
2. `deployToGateways()` hiện tại **không check ownership** và **không check published**.
3. `DeployFirmwareDto` chưa có field `gatewayIds`.

## Architecture

```
Mobile → POST /firmware/:id/deploy-gateways
         Body: { gatewayIds?: [...], farmId? }
         Auth: JwtAuthGuard + @CurrentUser

FirmwareController.deployGateways()
  └─ FirmwareService.deployGatewaysForUser(firmwareId, dto, userId)
      ├─ findOne(firmwareId) → assert isPublished
      ├─ Resolve gateway list:
      │   ├─ farmId path: check farm.userId === userId → GatewayService.findByFarm(farmId)
      │   └─ gatewayIds path: for each id → check gateway.farmId → farm.userId === userId
      └─ deployToGateways(firmwareId, resolvedIds) → return results
```

## Phases

| # | Phase | Status | Priority | Effort |
|---|-------|--------|----------|--------|
| 1 | [Gateway OTA Mobile Endpoint](./phase-01-gateway-ota-endpoint.md) | Complete | High | Small |

## Key Dependencies

- `FarmService.findOne(farmId)` — ownership check (đã có)
- `GatewayService.findOne(id)`, `findByFarm(farmId)` — gateway resolution (đã có)
- `FirmwareService.deployToGateways()` — reuse logic MQTT + log (đã có)

## Related Plans

- [260227-0859-esp-ota-firmware-update](../260227-0859-esp-ota-firmware-update/) — plan OTA gốc (Phase 7 WebSocket). Plan mới này **bổ sung** REST variant cho gateway, không xung đột.
