---
title: "Dual-Mode Device Gateway (WiFi + LoRa Fallback)"
status: completed
blockedBy: []
blocks: []
---

# Dual-Mode Device Gateway

**Brainstorm ref:** [brainstorm-260408-0942-dual-mode-device-gateway.md](../reports/brainstorm-260408-0942-dual-mode-device-gateway.md)

## Summary

Refactor device-gateway relationship from manual/discovery-based to fully auto-assigned at pair time (bidirectional). Remove device direct-connect block so WiFi always works. Clean up EMQX ACL. Unify OTA dual-channel dispatch.

## Constraints

- 1 farm = max 1 gateway (service-level check, existing)
- Devices always authenticate with `deviceToken` regardless of mode
- Firmware selects WiFi/LoRa autonomously — backend doesn't control mode

## Phases

| # | Phase | Status | Files |
|---|-------|--------|-------|
| 1 | [Auto-assign logic](./phase-01-auto-assign-logic.md) | completed | provision.service.ts, gateway.service.ts |
| 2 | [EMQX cleanup](./phase-02-emqx-cleanup.md) | completed | emqx.service.ts |
| 3 | [Remove device-report flow + manual endpoints](./phase-03-remove-device-report-flow.md) | completed | gateway.service.ts, mqtt.service.ts, gateway.controller.ts |
| 4 | [Firmware dual-channel OTA](./phase-04-firmware-dual-ota.md) | completed | firmware.service.ts |

## Execution Order

Phases 1 → 2 → 3 → 4 (sequential, each phase depends on prior for correctness).

## Key Files

- `src/provision/provision.service.ts`
- `src/gateway/gateway.service.ts`
- `src/gateway/gateway.controller.ts`
- `src/emqx/emqx.service.ts`
- `src/device/mqtt/mqtt.service.ts`
- `src/firmware/firmware.service.ts`
