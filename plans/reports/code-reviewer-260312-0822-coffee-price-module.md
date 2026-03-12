---
scope: CoffeePriceModule (7 files)
date: 2026-03-12
score: 7.5/10
verdict: Approved with minor fixes
---

## Code Review — CoffeePriceModule

### Scope
- Files: coffee-price.module.ts, coffee-price.service.ts, coffee-price.controller.ts, entities/coffee-price.entity.ts, enums/coffee-market.enum.ts, dto/query-coffee-price.dto.ts, app.module.ts
- LOC: ~230
- Focus: TypeScript correctness, security, error handling, TypeORM 0.2.41 compatibility, performance

### Overall Assessment

Solid, clean implementation. NestJS patterns are followed correctly. TypeORM 0.2.41 compatibility is fine — only standard Repository API and QueryBuilder are used. Puppeteer browser is always closed in `finally`. JWT guard is applied at the controller class level. No lint or TypeScript errors detected.

Three issues warrant attention before production: a silent data-loss bug in the number parser, unbounded `limit` input, and N+1 database queries in the upsert loop.

---

### Critical Issues

None.

---

### Major Issues

**1. Silent data-loss in `parseVietnameseNumber` — numbers with a leading minus sign are destroyed**

File: `coffee-price.service.ts`, line 128

```ts
const cleaned = text.replace(/[^\d,.-]/g, '').replace(/[,.]/g, '');
```

The second `.replace(/[,.]/g, '')` also strips the decimal dot if a European-style decimal is present (e.g. `"95.800"` → `"95800"` — that is intentional for thousands separators). However the first regex correctly retains `-`, but the second replace does not touch it, so a negative change like `"-1.200"` correctly becomes `"-1200"`. The real bug is subtler: if the site renders `"−1.200"` (Unicode minus U+2212 instead of ASCII hyphen), the first replace strips it entirely and `parseInt` returns a positive number.

Impact: `priceChange` silently becomes a wrong positive value. No error is logged.

Recommendation: Normalize Unicode minus to ASCII hyphen before the replace chain.

```ts
const cleaned = text
  .replace(/\u2212/g, '-')        // Unicode minus → ASCII hyphen
  .replace(/[^\d,.-]/g, '')
  .replace(/[,.]/g, '');
```

---

**2. Unbounded `limit` — DoS / slow query vector**

File: `coffee-price.service.ts`, line 160

```ts
qb.take(parseInt(query.limit || '30', 10));
```

`IsNumberString()` allows `"999999999"`. There is no upper cap. A caller can request millions of rows.

Recommendation: Cap the parsed value.

```ts
const limit = Math.min(parseInt(query.limit || '30', 10), 365);
qb.take(limit);
```

Alternatively add `@Max(365)` after `@Transform` in the DTO (requires `@nestjs/class-transformer`).

---

**3. N+1 queries in `upsertPrices`**

File: `coffee-price.service.ts`, lines 134–148

For each of the 7 markets the method issues one `findOne` + one `update` or `save` — up to 14 sequential round-trips per scrape.

Since TypeORM 0.2.x does not support `upsert()` natively, the preferred fix is one bulk `INSERT ... ON CONFLICT DO UPDATE` via a raw query, or fetch all existing records for the date in one query then decide in-memory.

```ts
// one SELECT for the full date
const existing = await this.coffeePriceRepo.find({ where: { date: prices[0].date } });
const existingMap = new Map(existing.map(e => [e.market, e]));
// then save / update in loop — still N writes but only 1 read
```

Impact is low at 7 markets but the pattern will bite if the market list grows.

---

### Minor Issues

**4. `date` stored as `varchar` string, typed as `string` — but `@Column({ type: 'date' })` maps to a JS `Date` object in TypeORM**

File: `coffee-price.entity.ts`, line 21 / `coffee-price.service.ts`, line 72

`@Column({ type: 'date' })` causes TypeORM to return the column as a `Date` object when reading (Postgres `date` type is deserialized by the `pg` driver). The entity declares `date: string` and the service compares it as a string (`where: { date: price.date }`). This mismatch is technically incorrect — it works because TypeORM normalizes the where clause, but it will cause silent failures if code ever compares `record.date === someString` directly.

Fix: Either change the column type to `varchar` (acceptable for a YYYY-MM-DD string) or change the TypeScript type to `Date` and update the service accordingly.

**5. Retry delay blocks the cron thread for up to 60 seconds**

File: `coffee-price.service.ts`, lines 29–31

```ts
await new Promise((r) => setTimeout(r, this.RETRY_DELAYS[attempt]));
```

This holds the cron worker thread for up to 60 s during retry 3. In `@nestjs/schedule` 1.1.0 this is a Node.js `setTimeout` inside an async method, so it does not block other cron jobs, but it does consume a Promise handle for a full minute. Not a hard bug but worth noting — a fire-and-forget with exponential back-off using `setTimeout` (not awaited) would be cleaner.

**6. `findLatest` subquery is not parameterized — minor style concern**

File: `coffee-price.service.ts`, lines 167–176

```ts
const subQuery = this.coffeePriceRepo
  .createQueryBuilder('sub')
  .select('MAX(sub.date)')
  .getQuery();

return this.coffeePriceRepo
  .createQueryBuilder('cp')
  .where(`cp.date = (${subQuery})`)
  ...
```

`getQuery()` returns the raw SQL string. Because the subquery has no user-supplied parameters it carries no injection risk here, but string-interpolating a query fragment is a bad pattern to establish. The idiomatic TypeORM way is `.subQuery()` inside the outer builder:

```ts
.where(qb => {
  const sub = qb.subQuery()
    .select('MAX(s.date)')
    .from(CoffeePrice, 's')
    .getQuery();
  return `cp.date = ${sub}`;
})
```

**7. `--no-sandbox` Puppeteer flag — document the deployment requirement**

File: `coffee-price.service.ts`, line 47

`--no-sandbox` is required in Docker but reduces the Chrome security sandbox. This is the correct approach for containerised deployments, but it should be gated on an environment variable or at least documented in the deployment guide so nobody runs it unintentionally on a desktop.

---

### Positive Observations

- Browser is unconditionally closed in `finally` — correct resource management.
- `@Cron` timezone is explicit (`Asia/Ho_Chi_Minh`) — avoids DST surprises.
- `@Unique(['date', 'market'])` constraint at the DB level is a safe guard against duplicate inserts.
- Dual index strategy (`['date']` + `['market', 'date']`) is appropriate for the expected query patterns.
- `matchMarket` handles both accented and non-accented Vietnamese spellings — robust against encoding variation.
- DTO uses `class-validator` decorators correctly; all fields optional with enum validation on `market`.
- `CoffeeMarketLabel` lookup object keeps display labels decoupled from storage keys.
- Controller applies `JwtAuthGuard` at class level — no endpoint accidentally left unguarded.
- Module registration in `AppModule` is correct; no duplicate `ScheduleModule.forRoot()`.
- Zero lint errors, zero TypeScript errors.

---

### Recommended Actions (priority order)

1. **[Major]** Add Unicode minus normalization in `parseVietnameseNumber` to prevent silent sign loss.
2. **[Major]** Cap `limit` to a sane maximum (e.g. 365) in `findAll`.
3. **[Major]** Fetch all existing prices for a date in one query before the upsert loop.
4. **[Minor]** Resolve `date: string` vs `@Column({ type: 'date' })` TypeORM type mismatch — use `varchar` to match the string usage pattern.
5. **[Minor]** Replace `getQuery()` string interpolation in `findLatest` with `.subQuery()` builder.
6. **[Minor]** Gate `--no-sandbox` on `NODE_ENV !== 'production'` or document deployment requirement.

---

### Metrics

- Type Coverage: ~95% (no `any` except implicit `error` in catch — acceptable)
- Test Coverage: 0% (no unit tests present — expected for a scraper but worth noting)
- Linting Issues: 0
- TypeScript Errors: 0

### Unresolved Questions

- Does the Cloudflare protection on giacaphe.com actively challenge Puppeteer? If so, `waitUntil: 'networkidle2'` may time out consistently after bot detection tightens. A failure-alert mechanism (Slack/email) on `All scrape attempts failed` log line would be prudent.
- Is `synchronize: true` intentionally left on for production? The entity adds a new DB table — this should be confirmed safe before the next deploy.
- Is `HO_TIEU` (pepper) intentionally included in a `CoffeePriceModule`? Fine as-is but naming may mislead future maintainers.
