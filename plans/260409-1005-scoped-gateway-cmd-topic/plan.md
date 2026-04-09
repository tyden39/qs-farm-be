---
title: "Scoped Gateway Command Topic (Option C)"
status: complete
priority: P1
effort: 2h
branch: master
tags: [gateway, mqtt, security, acl, topic]
created: 2026-04-09
blockedBy: []
blocks: []
---

# Scoped Gateway Command Topic

## Problem

Gateway subscribes `device/+/cmd` — MQTT wildcard that matches ALL devices across all farms.
Gateway firmware receives commands intended for other farms/users. Only trust is firmware self-filter.

## Solution

Scope the command topic per-gateway:
- **LoRa mode**: server publishes `gateway/{gwId}/device/{deviceId}/cmd`
- **WiFi mode**: server publishes `device/{deviceId}/cmd` (unchanged)
- **Gateway**: subscribes `gateway/{gwId}/device/+/cmd` (scoped to own gwId only)

EMQX enforces isolation at broker level — no cross-tenant command leakage.

## Phases

| # | Phase | Status | Files |
|---|-------|--------|-------|
| 1 | [Server-side topic routing](./phase-01-server-topic-routing.md) | complete | mqtt.service.ts, sync.service.ts, threshold.service.ts, device.service.ts |
| 2 | [EMQX ACL update](./phase-02-emqx-acl.md) | complete | emqx.service.ts |

## Key Files

- `src/device/mqtt/mqtt.service.ts`
- `src/device/sync/sync.service.ts`
- `src/sensor/threshold.service.ts`
- `src/device/device.service.ts`
- `src/emqx/emqx.service.ts`
- `src/device/sync/sync.service.spec.ts`

## Notes

- `provision.service.ts:447` publishes `device/{deviceId}/cmd` — intentionally kept (provisioning is always WiFi/direct, device is PENDING state, not LoRa-routed)
- Phase 1 must complete before Phase 2 (server must publish new topic before gateway switches subscription)
