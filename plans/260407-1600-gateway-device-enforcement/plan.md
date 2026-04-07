---
title: "Gateway-Device Enforcement"
description: "Enforce all device communication through gateway with auto-discovery, ACL validation, and device↔gateway mapping"
status: completed
priority: P1
effort: 2d
branch: master
tags: [gateway, device, enforcement, acl, mqtt, security]
created: 2026-04-07
blockedBy: []
blocks: []
---

# Gateway-Device Enforcement

## Overview

Enforce device↔gateway mapping so all gateway-connected devices MUST communicate through their assigned gateway. Add auto-discovery (gateway reports devices via LoRa scan) and 2-layer enforcement (Auth reject direct connect + ACL validate gateway ownership).

Mixed mode supported: devices without `gatewayId` continue WiFi direct.

```
[Device] ←LoRa→ [Gateway] ──MQTT──→ [EMQX] ──→ [NestJS]
                                       │
                          Auth: device.gatewayId? → reject direct
                          ACL:  device.gatewayId === gwId? → allow/deny
```

## Context

- Brainstorm: conversation session 2026-04-07
- Builds on completed plan: `260407-1033-lora-gateway-heartbeat`
- `Device.gatewayId` column exists (nullable uuid) but unused — no relation, no assignment flow, no enforcement
- `checkGatewayAcl()` currently allows ANY gateway to publish ANY `device/...` topic
- Design approved: C-lite (2-layer enforcement + auto-discovery)

## Phases

| # | Phase | Status | Priority | Effort |
|---|-------|--------|----------|--------|
| 01 | [Entity Relations + Device-Gateway API](phase-01-entity-relations-api.md) | completed | P1 | 2h |
| 02 | [Auth + ACL Enforcement](phase-02-auth-acl-enforcement.md) | completed | P1 | 3h |
| 03 | [Auto-Discovery via MQTT](phase-03-auto-discovery.md) | completed | P1 | 2h |

## Key Dependencies

- Phase 01 first (entity relation + API needed before enforcement)
- Phase 02 depends on Phase 01 (ACL cache queries devices by gatewayId)
- Phase 03 depends on Phase 01 (assign logic uses relation)

## Files Changed

- `src/device/entities/device.entity.ts` — add `@ManyToOne Gateway` relation
- `src/gateway/entities/gateway.entity.ts` — add `@OneToMany Device` relation
- `src/gateway/gateway.service.ts` — assign/unassign + discovery handler
- `src/gateway/gateway.controller.ts` — new endpoints
- `src/emqx/emqx.service.ts` — auth block + ACL ownership check + cache
- `src/device/mqtt/mqtt.service.ts` — subscribe discovery topic

## Files NOT Changed

- `src/device/sync/sync.service.ts` — commands still publish to `device/{id}/cmd` (gateway subscribes)
- `src/sensor/` — unchanged
- `src/schedule/` — unchanged
- WebSocket layer — unchanged
