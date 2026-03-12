# Phase 5: Testing & Verification

## Context

- Depends on Phases 1-4 being complete
- Uses existing test infrastructure (`yarn test`, `yarn build`)

## Overview

- **Priority:** P2
- **Status:** complete
- Build verification, manual scrape test, API verification

## Implementation Steps

### 1. Build Verification

```bash
yarn build
```

Ensures TypeScript compilation passes with all new files.

### 2. Manual Scrape Test

Add a temporary test endpoint or use NestJS REPL to trigger scrape manually:

```typescript
// Temporary: add to controller for testing, remove after verification
@Get('scrape-now')
scrapeNow() {
  return this.coffeePriceService.scrapeAndStore();
}
```

**Or** trigger via `yarn start:dev` and wait for cron, or call `handleDailyScrape()` from service directly.

Steps:
1. Start app: `yarn start:dev`
2. Hit `GET /api/coffee-price/scrape-now` (or wait for midnight cron)
3. Verify logs show "Parsed N market prices"
4. Check DB: `SELECT * FROM coffee_price ORDER BY date DESC;`
5. Verify all expected markets have entries
6. Run scrape again -- verify no duplicate rows (upsert working)

### 3. API Verification

```bash
# Get JWT token first (login)
TOKEN=$(curl -s -X POST localhost:3000/api/auth/sign-in \
  -H 'Content-Type: application/json' \
  -d '{"email":"...","password":"..."}' | jq -r '.accessToken')

# Test list endpoint
curl -s localhost:3000/api/coffee-price -H "Authorization: Bearer $TOKEN" | jq

# Test with filters
curl -s "localhost:3000/api/coffee-price?market=DAK_LAK&limit=5" \
  -H "Authorization: Bearer $TOKEN" | jq

# Test latest endpoint
curl -s localhost:3000/api/coffee-price/latest \
  -H "Authorization: Bearer $TOKEN" | jq

# Test auth required (should 401)
curl -s localhost:3000/api/coffee-price
```

### 4. Docker Verification (if applicable)

If deploying with Docker, verify Puppeteer works in container:
- Ensure Chromium is installed in Dockerfile
- Test scrape inside container
- Check `--no-sandbox` flag is set

### 5. Cleanup

- Remove temporary `scrape-now` endpoint if added
- Verify final `yarn build` passes
- Run `yarn lint` to check code style

## Todo

- [ ] `yarn build` passes
- [ ] Manual scrape stores correct data
- [ ] No duplicate rows on re-scrape
- [ ] `GET /api/coffee-price` returns data with filters
- [ ] `GET /api/coffee-price/latest` returns most recent scrape
- [ ] 401 returned without JWT token
- [ ] Swagger docs render correctly at `/api`
- [ ] `yarn lint` passes
- [ ] Remove any temporary test endpoints

## Success Criteria

- All markets scraped and stored correctly
- API endpoints return expected data
- Upsert prevents duplicates
- Auth enforced
- Clean build with no warnings
