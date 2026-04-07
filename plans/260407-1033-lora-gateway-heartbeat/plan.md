---
title: "LoRa Gateway + Device Heartbeat"
description: "Add transparent LoRa gateway layer per farm + fix device online status via heartbeat/lastSeenAt"
status: complete
priority: P1
effort: 3d
branch: master
tags: [gateway, lora, mqtt, iot, heartbeat, firmware, ota]
created: 2026-04-07
blockedBy: []
blocks: []
---

# LoRa Gateway + Device Heartbeat

## Overview

Thêm một lớp gateway ESP32+WiFi đứng giữa server và device. Gateway transparent với user — app/UI không thay đổi. Devices kết nối với gateway qua Raw LoRa (local), gateway forward lên EMQX qua WiFi/MQTT.

Đồng thời fix bug `isDeviceOnline()` luôn trả về `true` bằng cơ chế `lastSeenAt` + heartbeat.

```
[Device ESP32] ←LoRa→ [Gateway ESP32+WiFi] ←MQTT→ [EMQX] ←→ [NestJS] ←WS→ [App]
```

## Context

- Brainstorm: conversation session 2026-04-07
- Current bug: `isDeviceConnected()` chỉ check server MQTT client, không check device cụ thể
- Gateway transparent: SyncService, SensorService, ThresholdService, ScheduleService KHÔNG đổi
- MQTT topics device giữ nguyên — gateway publish thay device

## Phases

| # | Phase | Status | Priority |
|---|-------|--------|----------|
| 01 | [Device lastSeenAt + Heartbeat Fix](phase-01-device-heartbeat.md) | complete | P0 — fix bug |
| 02 | [Gateway Entity + Provision Flow](phase-02-gateway-provision.md) | complete | P1 |
| 03 | [EmqxModule Gateway Auth/ACL](phase-03-emqx-gateway-auth.md) | complete | P1 |
| 04 | [Gateway MQTT Integration](phase-04-gateway-mqtt.md) | complete | P1 |
| 05 | [Gateway + Device OTA](phase-05-gateway-ota.md) | complete | P2 |

## Key Dependencies

- Phase 01 độc lập, có thể ship trước
- Phase 02 → 03 → 04 phải theo thứ tự
- Phase 05 phụ thuộc Phase 04

## Files Không Đổi

- `src/device/sync/sync.service.ts` (chỉ thêm lastSeenAt update)
- `src/sensor/` — toàn bộ
- `src/schedule/` — toàn bộ
- `src/firmware/firmware.service.ts` (chỉ extend OTA ở Phase 05)
- Toàn bộ WebSocket events, REST API device/sensor/schedule
