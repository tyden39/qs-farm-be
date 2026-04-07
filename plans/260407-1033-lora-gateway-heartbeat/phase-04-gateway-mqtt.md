# Phase 04 — Gateway MQTT Integration

## Overview

- **Priority:** P1
- **Status:** complete
- **Effort:** 2h
- **Depends on:** Phase 02, 03

Subscribe các MQTT topics của gateway trong server. Xử lý heartbeat để cập nhật `lastSeenAt`. Gateway online status dùng cùng cơ chế `lastSeenAt` như device (Phase 01).

## Key Insights

- Không cần service mới — extend `GatewayService` với MQTT handling
- `gateway/{gwId}/status` dùng cho cả heartbeat lẫn LWT (giống `device/{deviceId}/status`)
- `MqttService` cần subscribe wildcard `gateway/+/status` khi init
- GatewayService inject MqttService qua EventEmitter để tránh circular dependency (pattern giống Phase 02)

## MQTT Topics Server Cần Subscribe

```
gateway/+/status    ← heartbeat (type: "heartbeat") + LWT (reason: "lwt")
```

Topics khác (`gateway/{gwId}/ota`, `gateway/{gwId}/device-ota`) là server PUBLISH, không subscribe.

## Related Files

**Modify:**
- `src/device/mqtt/mqtt.service.ts` — subscribe `gateway/+/status`
- `src/gateway/gateway.service.ts` — handle gateway status events + `lastSeenAt`
- `src/gateway/gateway.controller.ts` — thêm `GET /gateways/:id/status`

## Implementation Steps

### 1. Subscribe `gateway/+/status` trong MqttService

File: `src/device/mqtt/mqtt.service.ts`

Thêm vào `onModuleInit()` (sau các device subscriptions):
```typescript
// Gateway status (heartbeat + LWT)
this.onMessage('gateway/+/status', (message: MqttMessage) => {
  // Extract gatewayId từ topic: gateway/{gwId}/status
  const gwId = message.topic.split('/')[1];
  this.eventEmitter.emit('gateway.status.received', {
    gatewayId: gwId,
    payload: message.payload,
    timestamp: message.timestamp,
  });
});
```

> `MqttMessage` hiện tại có `deviceId` từ topic parse. Gateway dùng `gwId` — cần extract thủ công từ `message.topic` hoặc extend MqttMessage type.

### 2. Handle gateway status trong GatewayService

File: `src/gateway/gateway.service.ts`

```typescript
@OnEvent('gateway.status.received')
async handleGatewayStatus(data: { gatewayId: string; payload: any; timestamp: Date }) {
  const { gatewayId, payload } = data;

  if (payload.type === 'heartbeat') {
    await this.gatewayRepository.update(gatewayId, {
      lastSeenAt: new Date(),
      // Cập nhật firmwareVersion nếu có trong heartbeat payload
      ...(payload.fw && { firmwareVersion: payload.fw }),
    });
    return; // Không broadcast
  }

  if (payload.reason === 'lwt') {
    this.logger.warn(`Gateway disconnected (LWT): ${gatewayId}`);
    await this.gatewayRepository.update(gatewayId, { lastSeenAt: null });
    // TODO: notify farm owner nếu cần (future)
  }
}
```

### 3. Gateway online check

File: `src/gateway/gateway.service.ts`

```typescript
isGatewayOnline(gateway: Gateway): boolean {
  if (!gateway.lastSeenAt) return false;
  return (Date.now() - gateway.lastSeenAt.getTime()) < 90_000;
}
```

### 4. Thêm `GET /gateways/:id/status` endpoint

File: `src/gateway/gateway.controller.ts`

```typescript
@Get(':id/status')
@UseGuards(JwtAuthGuard)
async getGatewayStatus(@Param('id') id: string) {
  const gateway = await this.gatewayService.findOne(id);
  return {
    gatewayId: id,
    serial: gateway.serial,
    status: gateway.status,
    online: this.gatewayService.isGatewayOnline(gateway),
    lastSeenAt: gateway.lastSeenAt,
    firmwareVersion: gateway.firmwareVersion,
  };
}
```

### 5. Gateway heartbeat payload format

Gateway firmware gửi mỗi 30s:
```json
{ "type": "heartbeat", "fw": "1.0.0", "ts": 12345 }
```

LWT được EMQX tự publish khi gateway disconnect:
```json
{ "reason": "lwt" }
```

Gateway cần set LWT khi connect MQTT:
```c
// Gateway firmware ESP32
mqttClient.setWill(
  ("gateway/" + gatewayId + "/status").c_str(),
  "{\"reason\":\"lwt\"}",
  1,    // QoS
  true  // retain
);
```

## Todo

- [x] Subscribe `gateway/+/status` trong `mqtt.service.ts` → emit event
- [x] `@OnEvent('gateway.status.received')` trong `gateway.service.ts`
- [x] Update `lastSeenAt` / null on heartbeat / LWT
- [x] `isGatewayOnline()` method
- [x] `GET /gateways/:id/status` endpoint
- [x] Compile check: `yarn build`

## Success Criteria

- Gateway gửi heartbeat → `Gateway.lastSeenAt` cập nhật trong DB
- Gateway disconnect → `Gateway.lastSeenAt = null`
- `GET /gateways/:id/status` → `online: true/false` chính xác
- Heartbeat không gây side effects khác (không broadcast WebSocket)

## Risk

- `MqttMessage` type hiện tại extract `deviceId` từ topic pattern `device/+/...` — cần xử lý riêng cho `gateway/+/status` vì pattern khác. Extract `gwId` thủ công từ `topic.split('/')`.
