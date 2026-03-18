# Phase 1: Enum & Entity

**Status:** ⬜ Todo
**Priority:** High
**Effort:** Small

## Context Links

- Entity: `src/pump/entities/pump-session.entity.ts`
- Existing enums: `src/pump/enums/`

## Overview

Tạo enum `PumpOperationMode` và thêm field `operationMode` vào `PumpSession` entity.

## Related Code Files

**Create:**
- `src/pump/enums/pump-operation-mode.enum.ts`

**Modify:**
- `src/pump/entities/pump-session.entity.ts` — add `operationMode` column

## Implementation Steps

### 1. Create `PumpOperationMode` enum

```typescript
// src/pump/enums/pump-operation-mode.enum.ts
export enum PumpOperationMode {
  NORMAL = 'normal',  // Bật/tắt thông thường
  SPRAY = 'spray',    // Tưới phun mưa (câu lớn)
  ROOT = 'root',      // Tưới gốc cây (cây nhỏ)
  DRIP = 'drip',      // Tưới nhỏ giọt (tiết kiệm nước)
}
```

### 2. Add `operationMode` to `PumpSession` entity

Add after `sessionNumber` field:

```typescript
@Column({
  type: 'enum',
  enum: PumpOperationMode,
  default: PumpOperationMode.NORMAL,
})
operationMode: PumpOperationMode;
```

TypeORM `synchronize: true` sẽ tự thêm column vào DB.

## Todo

- [ ] Create `pump-operation-mode.enum.ts`
- [ ] Add `operationMode` column to `pump-session.entity.ts`
- [ ] Run `yarn build` to verify no compile errors

## Success Criteria

- Enum file exists and exports correctly
- `PumpSession` entity has `operationMode` with default `normal`
- `yarn build` passes
