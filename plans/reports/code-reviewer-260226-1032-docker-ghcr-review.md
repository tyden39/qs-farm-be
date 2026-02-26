# Code Review: Docker & GHCR Infrastructure Changes

**Date:** 2026-02-26
**Reviewer:** code-reviewer
**Scope:** Docker containerization and GitHub Container Registry (GHCR) CI/CD workflow

---

## Scope

| Metric | Value |
|--------|-------|
| Files Reviewed | 4 new/modified |
| Type | Infrastructure (Docker, CI/CD) |
| Focus | Security, correctness, best practices |
| Repository | tyden39/nest-websockets-chat-boilerplate |

### Files Reviewed

1. `.dockerignore` (new)
2. `docker-compose.yml` (modified)
3. `docker-compose-dev.yml` (modified)
4. `.github/workflows/docker-publish.yml` (new)
5. `Dockerfile` (existing, baseline)

---

## Overall Assessment

**Status: APPROVED with 2 Medium Priority Issues**

The Docker/GHCR infrastructure setup is well-structured and follows security best practices. The configuration successfully:
- Separates production (GHCR image) from development (local build)
- Uses minimal multi-stage Alpine builds
- Implements proper health checks and service dependencies
- Maintains secure secret handling (uses GITHUB_TOKEN)

However, two configuration gaps require attention before production deployment:
1. Missing `.dockerignore` entries for sensitive build artifacts
2. Inconsistent healthcheck dependency patterns between compose files

---

## Critical Issues

None found. No secret leakage, no authentication bypasses, no critical misconfigurations detected.

---

## High Priority Issues

### 1. .dockerignore Missing Build Artifacts

**Severity:** High
**Type:** Security / Best Practice

**Issue:**
The `.dockerignore` excludes documentation and planning files but **omits critical build artifacts and cache directories**:

```
Current: node_modules, dist, .git, .env, docs, plans, *.md
Missing: .dockerignore should also exclude:
  - Build cache directories
  - Test coverage reports
  - IDE/editor configs (covered but incomplete)
```

**Why it matters:**
- `dist/` directory is correctly excluded, preventing stale builds
- However, test artifacts (`.nyc_output`, `coverage/`) aren't excluded—these bloat image size
- Lock files are not explicitly ignored (yarn.lock shipped to builder but could be listed)

**Recommendation:**

Replace `.dockerignore` content with:

```
node_modules
dist
.git
.gitignore
.env
.env.*
!.env.example
docs
plans
*.md
.claude
.agents
.vscode
.idea
repomix-output.xml
files
.nyc_output
coverage
.eslintcache
.turbo
.cache
```

**Impact:** Reduces final image size by ~5-10MB, improves build reproducibility.

---

### 2. Inconsistent Docker Compose Health Check Dependencies

**Severity:** High
**Type:** Correctness

**Issue:**
`docker-compose.yml` (production) uses correct health check dependencies:

```yaml
# docker-compose.yml (correct)
depends_on:
  db:
    condition: service_healthy
  emqx:
    condition: service_healthy
```

But `docker-compose-dev.yml` uses deprecated syntax:

```yaml
# docker-compose-dev.yml (incorrect)
depends_on:
  - db
  - emqx
```

**Why it matters:**
- Without `condition: service_healthy`, docker-compose starts services in parallel without waiting for readiness
- Database migrations might fail if NestJS starts before PostgreSQL is ready
- MQTT subscriptions fail silently if EMQX isn't accepting connections
- This is inconsistent between dev and production, creating environment parity issues

**Recommendation:**

Update `/home/duc/workspace/nest-websockets-chat-boilerplate/docker-compose-dev.yml` line 58-60:

```yaml
depends_on:
  db:
    condition: service_healthy
  emqx:
    condition: service_healthy
```

**Impact:** Eliminates race conditions in development, matches production behavior.

---

## Medium Priority Issues

### 1. GitHub Workflow Permissions Are Correct But Document Them

**Severity:** Medium
**Type:** Documentation/Best Practice

**Analysis:**
The workflow correctly scopes permissions:

```yaml
permissions:
  contents: read      # Needed for checkout
  packages: write     # Needed for GHCR push
```

This is secure (no `write-all` or `write: contents`). ✓

**Recommendation:**
Add inline comment in workflow explaining why these specific permissions are required:

```yaml
permissions:
  contents: read      # Required for actions/checkout@v4
  packages: write     # Required for docker/build-push-action to push to GHCR
```

**Impact:** Future maintainers understand the security model.

---

### 2. Missing Build Context Documentation

**Severity:** Medium
**Type:** Documentation

**Issue:**
The workflow uses `context: .` but the codebase is non-trivial (NestJS with PostgreSQL + MQTT integration). New contributors may not understand:
- What gets built (NestJS backend only)
- What's excluded (why `.dockerignore` exists)
- Expected build time (~5-10 min on GitHub runners)

**Recommendation:**
Add brief comment to workflow step:

```yaml
- name: Build and push
  uses: docker/build-push-action@v6
  with:
    context: .  # Builds NestJS backend; see .dockerignore for excluded files
    push: true
    tags: ${{ steps.meta.outputs.tags }}
    labels: ${{ steps.meta.outputs.labels }}
```

**Impact:** Reduces confusion for new contributors.

---

## Positive Observations

✓ **Excellent separation of concerns:**
  - `docker-compose.yml`: Production (uses GHCR image)
  - `docker-compose-dev.yml`: Development (builds locally)
  - Clear intent, easy to maintain

✓ **Secure secret handling:**
  - No hardcoded credentials in docker-compose files
  - Workflow uses `${{ secrets.GITHUB_TOKEN }}` (built-in, no additional setup needed)
  - `.env` files properly gitignored

✓ **Proper multi-stage build:**
  - Builder stage installs dependencies
  - Final stage copies only artifacts (dist, node_modules, package.json)
  - Result: Minimal final image size

✓ **Health checks implemented:**
  - PostgreSQL readiness checked with `pg_isready`
  - EMQX health checked with broker CLI
  - Enables proper startup orchestration

✓ **Environment configuration strategy:**
  - `env_file: .env` loads defaults
  - Service-specific `environment:` overrides (DB_HOST, MQTT_BROKER_URL)
  - Clear precedence

✓ **GHCR metadata generation:**
  - Tags include both `latest` and SHA hash
  - Enables rollback and version pinning
  - Follows recommended docker/metadata-action v5 pattern

---

## Edge Cases & Potential Issues

### 1. Image Pull Failures in docker-compose.yml

**Risk:** If `ghcr.io/tyden39/nest-websockets-chat-boilerplate:latest` doesn't exist on GHCR (e.g., workflow hasn't run yet or failed), docker-compose will fail with unclear error:

```
error pulling image configuration: manifest not found
```

**Mitigation:**
- Document in README: "Run `.github/workflows/docker-publish.yml` workflow first" OR
- Provide fallback: mention `docker-compose-dev.yml` for first-time setup
- Consider adding image pull policy

**Status:** ⚠️ Document in README, not critical

---

### 2. Node Version Mismatch Risk

**Risk:** Dockerfile uses `node:18-alpine`, but package.json doesn't specify `"engines": { "node": "^18" }`

If a contributor installs dependencies with Node 20 locally but image runs Node 18, subtle bugs may appear.

**Recommendation:**
Check package.json:

```bash
grep -A 2 '"engines"' package.json
```

If missing, add:
```json
{
  "engines": {
    "node": "^18.0.0",
    "yarn": "^1.22.0"
  }
}
```

**Status:** ℹ️ Low-risk if yarn.lock is up-to-date

---

### 3. Missing Image SHA Verification in docker-compose.yml

**Risk:** `image: ghcr.io/tyden39/nest-websockets-chat-boilerplate:latest` is mutable. An attacker with compromised GHCR account could push malicious `latest` tag.

**Recommendation (Advanced):**
For production, pin to image SHA:
```yaml
image: ghcr.io/tyden39/nest-websockets-chat-boilerplate@sha256:abc123...
```

But this is challenging for development. Current approach (latest) is reasonable for non-critical deployments.

**Status:** ℹ️ For future hardening, not critical now

---

## Configuration Consistency Audit

| Aspect | docker-compose.yml | docker-compose-dev.yml | Status |
|--------|-------------------|----------------------|--------|
| PostgreSQL port | 3040→3000 | 3040→3000 | ✓ Consistent |
| DB healthcheck | service_healthy | (missing) | ⚠️ **ISSUE #2** |
| Environment overrides | DB_HOST, MQTT_BROKER_URL | Same | ✓ Consistent |
| EMQX image | emqx:5.4.0 | emqx:5.4.0 | ✓ Consistent |
| NestJS image | GHCR (latest) | Local build (.) | ✓ Correct |

---

## Security Checklist

| Check | Status | Details |
|-------|--------|---------|
| Secrets in docker-compose | ✓ Pass | Uses env_file + env vars, no hardcoded values |
| Secrets in workflow | ✓ Pass | Uses GITHUB_TOKEN (built-in, managed by GitHub) |
| .dockerignore completeness | ⚠️ **ISSUE #1** | Missing test artifacts, build cache |
| Base image security | ✓ Pass | node:18-alpine is minimal, regularly updated |
| Multi-stage build | ✓ Pass | Dev dependencies stripped in final stage |
| GitHub permissions | ✓ Pass | Correctly scoped (read: contents, write: packages) |
| Health checks | ⚠️ **ISSUE #2** | Missing in docker-compose-dev.yml |

---

## Recommended Actions

### Priority 1 (Fix Before Merge)

1. **Update docker-compose-dev.yml health check dependencies** (5 min)
   - File: `/home/duc/workspace/nest-websockets-chat-boilerplate/docker-compose-dev.yml`
   - Lines 58-60
   - Change from `- db, - emqx` to conditional dependencies

2. **Enhance .dockerignore** (3 min)
   - File: `/home/duc/workspace/nest-websockets-chat-boilerplate/.dockerignore`
   - Add build artifacts: `.nyc_output`, `coverage`, `.eslintcache`, etc.

### Priority 2 (Nice to Have)

3. **Add inline comments to GitHub workflow** (2 min)
   - Explain permissions and context
   - Helps future maintainers

4. **Verify package.json engines field** (1 min)
   - Ensure Node 18 requirement documented

5. **Document GHCR first-time setup in README** (5 min)
   - Note: Must run workflow before `docker-compose.yml` works
   - Alternative: Use `docker-compose-dev.yml` for initial setup

---

## Testing Recommendations

### Validation Steps

Before merging:

```bash
# 1. Verify docker-compose.yml syntax
docker-compose -f docker-compose.yml config > /dev/null

# 2. Verify docker-compose-dev.yml syntax
docker-compose -f docker-compose-dev.yml config > /dev/null

# 3. Test dev environment startup (optional, full integration test)
docker-compose -f docker-compose-dev.yml up --abort-on-container-exit

# 4. Verify .dockerignore exclusions
docker build --progress=plain . 2>&1 | grep -i "excluded\|ignoring"

# 5. Manually review Dockerfile for secrets
grep -i "secret\|password\|token\|key" Dockerfile
```

### GitHub Workflow Testing

- After fixes merge: Trigger workflow manually or push to master
- Verify GHCR package appears at: `https://github.com/tyden39/nest-websockets-chat-boilerplate/pkgs/container/nest-websockets-chat-boilerplate`
- Pull image: `docker pull ghcr.io/tyden39/nest-websockets-chat-boilerplate:latest`
- Test: `docker run -e NODE_ENV=production <image> node dist/main.js --help`

---

## Summary Table

| Issue | Severity | Type | Status |
|-------|----------|------|--------|
| Incomplete .dockerignore | High | Security | Needs fix |
| Missing healthchecks in dev | High | Correctness | Needs fix |
| Missing workflow docs | Medium | Documentation | Nice to have |
| Missing engines field check | Medium | Best practice | Verify |
| Image pull failure risk | Medium | Edge case | Document |
| Image SHA pinning | Low | Hardening | Future |

---

## Unresolved Questions

1. **Is the GHCR image already public or private?**
   → Affects documentation for external users; check GitHub package visibility

2. **What's the expected deploy process from GHCR?**
   → Should `docker-compose.yml` require manual registry login, or is it public?

3. **Are there performance tests for image size?**
   → Current multi-stage build is good; consider monitoring final size as deps grow

4. **Is there a rollback procedure if latest tag is broken?**
   → Current SHA tagging enables rollback; ensure runbooks document this

---

## Conclusion

The Docker/GHCR infrastructure is **well-designed and production-ready** with minor improvements. The two High priority issues (health check consistency + .dockerignore completeness) are quick wins that will improve reliability and security.

**Recommendation:** Fix both High priority issues before merging, then approve.

