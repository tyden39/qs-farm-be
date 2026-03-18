# Pump Operation Mode — Session Tracking

**Status:** 🟡 In Progress
**Priority:** Medium
**Branch:** master
**Created:** 2026-03-17

## Goal

Ghi nhận kiểu chạy của máy bơm vào mỗi phiên hoạt động (PumpSession), hỗ trợ 4 chế độ:

| Mode | Value | Mô tả |
|------|-------|-------|
| NORMAL | `normal` | Bật/tắt thông thường |
| SPRAY | `spray` | Tưới phun mưa (câu lớn) |
| ROOT | `root` | Tưới gốc cây (cây nhỏ) |
| DRIP | `drip` | Tưới nhỏ giọt (tiết kiệm nước) |

## Phases

| Phase | File | Status |
|-------|------|--------|
| 1 | [phase-01-enum-entity.md](phase-01-enum-entity.md) | ⬜ Todo |
| 2 | [phase-02-event-sync.md](phase-02-event-sync.md) | ⬜ Todo |
| 3 | [phase-03-report-excel.md](phase-03-report-excel.md) | ⬜ Todo |

## Key Dependencies

- `src/pump/entities/pump-session.entity.ts` — add `operationMode` field
- `src/device/sync/sync.service.ts` — extract mode from telemetry
- `src/pump/pump.service.ts` — save mode when session starts
- TypeORM `synchronize: true` handles migration automatically

## Data Flow

```
App sends command → SyncService.sendCommandToDevice({ command: 'pump_on', mode: 'drip' })
  → MQTT to ESP: { command: 'pump_on', mode: 'drip' }
  → ESP starts pump, echoes back: { pumpStatus: 1, sessionId: null, mode: 'drip' }
  → SyncService emits pump.started({ deviceId, sessionId, mode: 'drip' })
  → PumpService creates PumpSession with operationMode: 'drip'
```
