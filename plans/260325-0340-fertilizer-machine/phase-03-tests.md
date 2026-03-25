# Phase 03 — Tests

## Context Links
- SyncService: `src/device/sync/sync.service.ts`
- Existing tests: `src/device/` (check for `*.spec.ts`)

## Overview
- **Priority:** P2
- **Status:** Completed
- **Blocked by:** Phase 02
- **Description:** Unit tests for fertilizer guard in SyncService + DTO validation.

## Key Insights
- Focus on guard behavior: hasFertilizer=false → reject, hasFertilizer=true → pass
- Non-fertilizer commands must be unaffected regardless of hasFertilizer value
- Check existing test patterns in `src/device/*.spec.ts` before writing new ones

## Requirements
- Test `sendCommandToDevice` guard for fertilizer commands
- Test that non-fertilizer commands bypass the guard
- Test both `hasFertilizer=true` and `hasFertilizer=false` scenarios

## Related Code Files
- **Check existing:** `src/device/**/*.spec.ts`
- **Modify or create:** `src/device/sync/sync.service.spec.ts`

## Implementation Steps

### Step 1: Check existing test files

```bash
find src/device -name '*.spec.ts'
```

### Step 2: Write/extend SyncService unit tests

```typescript
describe('sendCommandToDevice - fertilizer guard', () => {
  it('should throw BadRequestException when hasFertilizer=false and command is fertilizer_on', async () => {
    mockDeviceService.findOne.mockResolvedValue({ hasFertilizer: false });
    await expect(
      service.sendCommandToDevice('device-id', 'fertilizer_on', {})
    ).rejects.toThrow(BadRequestException);
  });

  it('should proceed when hasFertilizer=true and command is fertilizer_on', async () => {
    mockDeviceService.findOne.mockResolvedValue({ hasFertilizer: true });
    await expect(
      service.sendCommandToDevice('device-id', 'fertilizer_on', {})
    ).resolves.toBeDefined();
  });

  it('should not check hasFertilizer for non-fertilizer commands', async () => {
    // pump_on should pass regardless of hasFertilizer
    await expect(
      service.sendCommandToDevice('device-id', 'pump_on', {})
    ).resolves.toBeDefined();
    expect(mockDeviceService.findOne).not.toHaveBeenCalled();
  });
});
```

### Step 3: Run tests

```bash
yarn test --testPathPattern=sync.service
yarn test
```

## Todo List

- [x] Find existing SyncService spec file (or create `sync.service.spec.ts`)
- [x] Add test: `fertilizer_on` with `hasFertilizer=false` → `BadRequestException`
- [x] Add test: `fertilizer_on` with `hasFertilizer=true` → succeeds
- [x] Add test: `pump_on` unaffected (no hasFertilizer check called)
- [x] Run `yarn test` — all tests pass

## Success Criteria
- All new tests pass
- No regressions in existing test suite
- `yarn test` exits with code 0

## Risk Assessment
- **Low:** Guard logic is simple; mock setup follows existing patterns

## Next Steps
- Deferred: sensor types, thresholds, alerts — add when hardware sensor specs finalized
- Deferred: fertilizer-specific API endpoints for filtering schedules/logs by fertilizer
