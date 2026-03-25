---
phase: 6
title: "Register FertilizerModule in AppModule"
status: pending
priority: P1
---

# Phase 6: Register FertilizerModule in AppModule

## Overview

Import and register FertilizerModule in the root AppModule.

## File to Modify

- `src/app.module.ts`

## Implementation Steps

### 1. Add import statement

```typescript
import { FertilizerModule } from './fertilizer/fertilizer.module';
```

### 2. Add to imports array

Add `FertilizerModule` after `PumpModule` in the `@Module` imports array:

```typescript
PumpModule,
FertilizerModule,  // <-- add here
ZoneModule,
```

## Success Criteria

- [ ] FertilizerModule imported and registered
- [ ] `yarn build` succeeds
- [ ] `yarn start:dev` starts without errors
- [ ] `GET /api` shows Fertilizer Sessions in Swagger

## File Structure After All Phases

```
src/fertilizer/
  entities/
    fertilizer-session.entity.ts
  enums/
    fertilizer-session-status.enum.ts
    fertilizer-interrupted-reason.enum.ts
    fertilizer-control-mode.enum.ts
  dto/
    fertilizer-report-query.dto.ts
  fertilizer.service.ts
  fertilizer.controller.ts
  fertilizer.module.ts
```
