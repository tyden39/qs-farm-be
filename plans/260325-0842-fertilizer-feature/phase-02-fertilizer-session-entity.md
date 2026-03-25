---
phase: 2
title: "FertilizerSession Entity + Enums"
status: pending
priority: P1
---

# Phase 2: FertilizerSession Entity + Enums

## Overview

Create the FertilizerSession entity and supporting enums. Mirrors PumpSession but without pressure/flow/irrigationMode fields.

## Files to Create

### 1. `src/fertilizer/enums/fertilizer-session-status.enum.ts`

```typescript
export enum FertilizerSessionStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  INTERRUPTED = 'interrupted',
}
```

### 2. `src/fertilizer/enums/fertilizer-interrupted-reason.enum.ts`

```typescript
export enum FertilizerInterruptedReason {
  LWT = 'lwt',
  ESP_REBOOT = 'esp_reboot',
  TIMEOUT = 'timeout',
}
```

### 3. `src/fertilizer/enums/fertilizer-control-mode.enum.ts`

```typescript
// Re-export from shared for consistency with pump pattern
export { ControlMode as FertilizerControlMode } from 'src/shared/enums/control-mode.enum';
```

### 4. `src/fertilizer/entities/fertilizer-session.entity.ts`

Follow PumpSession pattern (`src/pump/entities/pump-session.entity.ts`). Key differences:

**Include these columns:**
- `id` (UUID PK)
- `deviceId` (UUID, ManyToOne -> Device)
- `sessionNumber` (int)
- `controlMode` (enum: FertilizerControlMode, default MANUAL)
- `startedAt` (timestamp)
- `endedAt` (timestamp, nullable)
- `durationSeconds` (float, nullable)
- `tempMin`, `tempMax`, `tempAvg` (float, nullable)
- `currentMin`, `currentMax`, `currentAvg` (float, nullable)
- `phaseCount` (int, default 0)
- `overcurrentDetected` (boolean, default false)
- `overcurrentCount` (int, default 0)
- `overcurrentMaxCurrent` (float, nullable)
- `hasAlert` (boolean, default false)
- `status` (enum: FertilizerSessionStatus, default ACTIVE)
- `interruptedReason` (enum: FertilizerInterruptedReason, nullable)
- `createdAt` (CreateDateColumn)

**Omit these pump-specific columns:**
- `irrigationMode` (no irrigation concept for fertilizer)
- `pressureMin`, `pressureMax`, `pressureAvg`
- `flowMin`, `flowMax`, `flowTotal`

**Indexes (match pump pattern):**
- `@Index(['deviceId', 'startedAt'])`
- `@Index(['deviceId', 'sessionNumber'])`

**Imports:**
```typescript
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { Device } from 'src/device/entities/device.entity';
import { FertilizerSessionStatus } from '../enums/fertilizer-session-status.enum';
import { FertilizerInterruptedReason } from '../enums/fertilizer-interrupted-reason.enum';
import { FertilizerControlMode } from '../enums/fertilizer-control-mode.enum';
```

## Success Criteria

- [ ] 3 enum files created
- [ ] Entity file created with correct columns, indexes, relations
- [ ] No pressure/flow/irrigationMode columns
- [ ] Project compiles (`yarn build`)
- [ ] TypeORM auto-syncs `fertilizer_session` table on startup
