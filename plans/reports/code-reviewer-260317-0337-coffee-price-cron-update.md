# Code Review: Coffee Price Cron Schedule Update

**Reviewed:** 2026-03-17 | **Files:** 2 | **LOC:** 4 modified + 1 formatting cleanup

## Scope
- **Files Modified:**
  1. `src/coffee-price/coffee-price.service.ts` (lines 22-23)
  2. `docs/system-architecture.md` (line 292)
- **Change Type:** Configuration update (cron schedule time shift)
- **Build Status:** ✓ TypeScript compilation successful, no lint errors

## Scout Findings

### Edge Cases & Dependencies Analyzed
1. **Scheduler Module Chain:** ScheduleModule.forRoot() registered in ScheduleModule, imported by AppModule → CoffeePriceModule can use @Cron decorator ✓
2. **Service Injection:** CoffeePriceService properly injected with TypeOrmModule for CoffeePrice entity ✓
3. **Method Signature:** handleDailyScrape() is async void with proper error logging (no promise leak) ✓
4. **Retry Logic:** Intact with 3-attempt strategy (0ms, 30s, 60s delays) independent of cron time ✓
5. **Timezone Handling:** Asia/Ho_Chi_Minh (UTC+7) is valid; NestJS @nestjs/schedule applies server-side timezone conversion ✓
6. **Data Persistence:** Upsert logic unchanged; cron time change won't affect DB consistency ✓
7. **No Concurrent Executions:** Even if previous run extends past noon, @Cron runs on wall-clock schedule (not interval-based), so new execution starts at next 12:00 ✓

## Overall Assessment

**EXCELLENT** — This is a straightforward, low-risk configuration change. The cron expression is correct, timezone handling is sound, documentation is synchronized, and no business logic is affected. Code quality is maintained. No action required.

---

## Critical Issues
None identified.

## High Priority Issues
None identified.

## Medium Priority Issues
None identified.

## Low Priority Issues

### 1. Minor Code Formatting (Line 130 in git diff)
**Severity:** Style | **Status:** Already fixed in diff

The original code had multi-line ternary:
```typescript
priceChange: row.change
  ? this.parseVietnameseNumber(row.change)
  : null,
```

This was correctly collapsed to single-line:
```typescript
priceChange: row.change ? this.parseVietnameseNumber(row.change) : null,
```

This follows Prettier single-line formatting for short ternaries. ✓

---

## Positive Observations

1. **Cron Expression Correctness:** `'0 12 * * *'` is ISO-standard for "12:00 every day" (minute=0, hour=12, day=any, month=any, dow=any). ✓

2. **Timezone Validation:** Asia/Ho_Chi_Minh is a valid IANA timezone. NestJS @nestjs/schedule correctly interprets this as UTC+7 Vietnam time. Server will schedule at equivalent UTC time (05:00 UTC = 12:00 Vietnam time during non-DST periods). ✓

3. **Comment Clarity:** Updated comment "Runs daily at noon (12:00 PM) Vietnam time" is explicit and unambiguous. ✓

4. **Documentation Sync:** system-architecture.md line 292 correctly updated from `'0 0'` → `'0 12'`. Architectural diagram stays current. ✓

5. **No Logic Changes:** Scraping algorithm, retry mechanism, parsing, database operations, and API contracts untouched. Pure time-shift with zero functional impact. ✓

6. **Retry Resilience:** 3-retry strategy with 30/60s delays remains effective regardless of execution time. Afternoon execution (12:00) gives web server more time to update prices vs. midnight. ✓

7. **Service Layer Isolation:** CoffeePriceService has no external dependencies beyond repository and logger — no cascade effects from timing change. ✓

---

## Edge Cases Handled

| Edge Case | Status | Notes |
|-----------|--------|-------|
| Previous task still running at noon | ✓ Safe | @Cron uses wall-clock schedule; new execution queued regardless of prior completion |
| Timezone DST transitions | ✓ Safe | NestJS/nestjs-schedule handles DST via system timezone DB; hardcoded 12:00 Vietnam time (UTC+7/+6) |
| Server restart during scheduled time | ✓ Safe | @Cron tasks are fire-and-forget after registration; restart doesn't trigger missed executions |
| Database connection unavailable | ✓ Handled | Error caught in try/catch, logged, retries continue with delays |
| Page selector changes (giacaphe.com) | ✓ Monitored | Code already logs "No prices parsed — check page selectors" for missing data |
| Multiple instances (horizontal scale) | ⚠ Potential | If cluster deployed, both instances will attempt scrape at 12:00 (causes duplicate DB writes with upsert) — consider @nestjs/bull for distributed locking if needed in future |

---

## Recommendations

**No immediate action required.** All checks pass.

### Optional Future Enhancements (Not blocking)
1. If deployed as horizontal cluster (multiple instances), add distributed lock via Redis or @nestjs/bull to prevent duplicate scrapes at noon.
2. Consider adding "last-scrape-time" metric to monitoring dashboard to verify execution actually occurs at new time on first production deploy.

---

## Metrics
- **Type Safety:** ✓ No type issues (cron string literals are validated at runtime)
- **Test Coverage:** N/A (configuration change; existing service logic untouched)
- **Linting:** ✓ No ESLint violations
- **Build:** ✓ Compiles successfully
- **Documentation:** ✓ Synchronized

---

## Verification Checklist

- [x] Cron expression syntax valid: `'0 12 * * *'` ✓
- [x] Timezone is real IANA ID: `'Asia/Ho_Chi_Minh'` ✓
- [x] Comment matches implementation: "noon (12:00 PM)" ✓
- [x] Architecture docs updated: Line 292 reflects new time ✓
- [x] No breaking changes to scraping logic ✓
- [x] Retry mechanism independent of cron time ✓
- [x] Database operations unchanged ✓
- [x] ScheduleModule properly registered ✓
- [x] Service properly injected ✓
- [x] Error handling intact ✓

---

## Unresolved Questions
None.
