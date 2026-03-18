# Phase 3: Report & Excel Export

**Status:** ⬜ Todo
**Priority:** Medium
**Effort:** Small
**Blocked by:** Phase 1

## Context Links

- `src/pump/pump.service.ts` — report generation + excel export
- `src/pump/pump.controller.ts` — report endpoint

## Overview

Bổ sung `operationMode` vào JSON report response và Excel export.

## Related Code Files

**Modify:**
- `src/pump/pump.service.ts` — include `operationMode` in summary + excel columns

## Implementation Steps

### 1. JSON report — mode breakdown in summary

Thêm thống kê số phiên theo từng mode vào `summary`:

```typescript
// Trong buildSummary() hoặc getReport()
const modeBreakdown = await this.pumpSessionRepo
  .createQueryBuilder('ps')
  .select('ps.operationMode', 'mode')
  .addSelect('COUNT(*)', 'count')
  .where('ps.deviceId = :deviceId', { deviceId })
  .andWhere('ps.startedAt >= :from AND ps.startedAt <= :to', { from, to })
  .groupBy('ps.operationMode')
  .getRawMany();

// Result added to summary:
// modeBreakdown: [{ mode: 'drip', count: 5 }, { mode: 'normal', count: 3 }]
```

### 2. Excel export — add Operation Mode column

Trong Sheet 1 "Pump Sessions", thêm cột `Operation Mode` sau cột `Session #`:

**Column order:**
```
Session # | Operation Mode | Start | End | Duration (min) | ...
```

**Mode display mapping:**
```typescript
const MODE_LABELS: Record<PumpOperationMode, string> = {
  [PumpOperationMode.NORMAL]: 'Bình thường',
  [PumpOperationMode.SPRAY]: 'Phun mưa',
  [PumpOperationMode.ROOT]: 'Tưới gốc',
  [PumpOperationMode.DRIP]: 'Nhỏ giọt',
};
```

**Cell coloring (optional, low priority):**
- `drip` → light green (tiết kiệm nước)
- `normal` → no color

### 3. sessions array in JSON response

`PumpSession` entity đã có `operationMode` — tự động xuất hiện trong response vì TypeORM serialize entity trực tiếp. Không cần thêm gì.

## Todo

- [ ] Add `modeBreakdown` to report summary in `pump.service.ts`
- [ ] Add "Operation Mode" column to Excel Sheet 1
- [ ] Add `MODE_LABELS` mapping for Vietnamese display in Excel
- [ ] Run `yarn build` to verify no compile errors

## Success Criteria

- JSON report summary includes `modeBreakdown` array
- Excel has Operation Mode column with Vietnamese labels
- `sessions` array in JSON includes `operationMode` field per session
- Build passes
