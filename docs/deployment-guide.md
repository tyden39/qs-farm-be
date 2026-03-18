# Deployment Guide

## Prerequisites

### System Requirements
- **OS:** Linux (Ubuntu 20.04+), macOS, or Windows with WSL2
- **Node.js:** 18.x or higher
- **Docker:** 20.10+ with Docker Compose 2.0+
- **PostgreSQL:** 14+ (or use Docker)
- **EMQX:** 5.4+ (or use Docker)

### Network Requirements
- **Port 3000:** NestJS API (backend)
- **Port 5432:** PostgreSQL database (internal/Docker)
- **Port 1883:** MQTT (devices)
- **Port 8083:** MQTT WebSocket
- **Port 18083:** EMQX Dashboard (admin)
- **Firewall:** Allow inbound MQTT (1883) and API (3000) for production

## Local Development Setup

### Quick Start (5 minutes)

```bash
# Clone repository
git clone <repository-url>
cd qs-farm

# Install dependencies
yarn install

# Copy environment variables
cp .env.example .env

# Start Docker containers (PostgreSQL + EMQX)
docker-compose -f docker-compose-dev.yml up -d

# Run development server with hot reload
yarn start:dev
```

### Access Points
- **Backend API:** http://localhost:3000
- **Swagger Docs:** http://localhost:3000/api
- **Database:** localhost:5432 (postgres user)
- **MQTT Broker:** mqtt://localhost:1883
- **EMQX Dashboard:** http://localhost:18083 (admin/public)

### Environment Configuration (.env)

```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_NAME=postgres
DB_PASS=pass123

# JWT Configuration
JWT_ACCESS_SECRET=dev-access-secret-change-in-production
JWT_REFRESH_SECRET=dev-refresh-secret-change-in-production
JWT_ACCESS_EXPIRE=60m
JWT_REFRESH_EXPIRE=30d

# MQTT Configuration
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=
MQTT_PASSWORD=

# EMQX Configuration (optional, for dashboard access)
EMQX_DASHBOARD_URL=http://localhost:18083
EMQX_API_KEY=
EMQX_API_SECRET=

# Firebase Cloud Messaging (v1.1+)
FIREBASE_SERVICE_ACCOUNT_PATH=/app/config/firebase-service-account.json

# Puppeteer Configuration (v1.3 - Coffee Price)
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Node Environment
NODE_ENV=development
```

## Development Docker Compose

**File:** `docker-compose-dev.yml`

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:14-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_DB: postgres
      POSTGRES_PASSWORD: pass123
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  emqx:
    image: emqx/emqx:5.4.0
    environment:
      EMQX_NODE__DIST_LISTEN_MIN: 6369
      EMQX_NODE__DIST_LISTEN_MAX: 6379
    ports:
      - "1883:1883"    # MQTT
      - "8083:8083"    # WebSocket
      - "18083:18083"  # Dashboard
    healthcheck:
      test: ["CMD", "/opt/emqx/bin/emqx_ctl", "status"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

## Production Deployment

### Environment Setup (Production)

```bash
# Generate strong secrets
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Create .env.production
DB_HOST=prod-database.example.com
DB_PORT=5432
DB_USERNAME=prod_user
DB_NAME=farm_management
DB_PASS=<strong-password>

JWT_ACCESS_SECRET=<generated-secret-1>
JWT_REFRESH_SECRET=<generated-secret-2>
JWT_ACCESS_EXPIRE=60m
JWT_REFRESH_EXPIRE=30d

MQTT_BROKER_URL=mqtt://emqx.example.com:1883
MQTT_USERNAME=<broker-user>
MQTT_PASSWORD=<broker-password>

EMQX_DASHBOARD_URL=https://emqx-admin.example.com
EMQX_API_KEY=<api-key>
EMQX_API_SECRET=<api-secret>

# Firebase Cloud Messaging (v1.1+)
FIREBASE_SERVICE_ACCOUNT_PATH=/app/config/firebase-service-account.json

# Puppeteer Configuration (v1.3)
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

NODE_ENV=production
```

### System Dependencies for New Modules

**Dockerfile updates for v1.4.1:**

```dockerfile
# Install system dependencies for Puppeteer (v1.3 - Coffee Price) and Chromium
RUN apt-get update && apt-get install -y \
    chromium-browser \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libgconf-2-4 \
    libgdk-pixbuf1.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libicu67 \
    libpangocairo-1.0-0 \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxinerama1 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Pre-create /app/files/firmware directory for non-root user
RUN mkdir -p /app/files/firmware && chown -R node:node /app/files
```

### Building for Production

```bash
# Install dependencies
yarn install

# Build production bundle
yarn build

# Output: dist/ directory with compiled code
# Verify build: ls -la dist/

# Build Docker image
docker build -t farm-management:1.4.1 .
```

### Production Docker Compose

**File:** `docker-compose.yml`

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:14-alpine
    environment:
      POSTGRES_USER: ${DB_USERNAME}
      POSTGRES_DB: ${DB_NAME}
      POSTGRES_PASSWORD: ${DB_PASS}
    volumes:
      - postgres_prod_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USERNAME}"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  emqx:
    image: emqx/emqx:5.4.0
    environment:
      EMQX_AUTH__BUILT_IN_DATABASE__PASSWORD_HASH_TYPE: bcrypt
      EMQX_AUTH__MYSQL__ENABLE: "false"
    ports:
      - "1883:1883"
      - "8883:8883"  # MQTT SSL
      - "8083:8083"
      - "18083:18083"
    volumes:
      - emqx_data:/opt/emqx/data
    healthcheck:
      test: ["CMD", "/opt/emqx/bin/emqx_ctl", "status"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  backend:
    image: farm-management:1.4.1
    environment:
      NODE_ENV: production
      DB_HOST: postgres
      DB_PORT: 5432
      DB_USERNAME: ${DB_USERNAME}
      DB_NAME: ${DB_NAME}
      DB_PASS: ${DB_PASS}
      MQTT_BROKER_URL: mqtt://emqx:1883
      JWT_ACCESS_SECRET: ${JWT_ACCESS_SECRET}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
      FIREBASE_SERVICE_ACCOUNT_PATH: /app/config/firebase-service-account.json
      PUPPETEER_EXECUTABLE_PATH: /usr/bin/chromium
    volumes:
      - /app/files:/app/files
      - /app/config:/app/config:ro
      - /app/logs:/app/logs
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
      emqx:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    restart: unless-stopped
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  postgres_prod_data:
  emqx_data:
```

### Deployment Steps

```bash
# 1. Prepare server
ssh user@prod-server
cd /opt/farm-management

# 2. Clone/pull latest code
git clone <repo-url> .
# or
git pull origin main

# 3. Copy environment file
cp .env.example .env.production
# Edit .env.production with production secrets

# 4. Build Docker image
docker build -t farm-management:1.4.1 .

# 5. Stop old containers
docker-compose down

# 6. Start new containers
docker-compose up -d

# 7. Verify services
docker-compose ps
docker-compose logs backend

# 8. Verify connectivity
curl http://localhost:3000/api
```

### Zero-Downtime Deployment

```bash
# 1. Build new image
docker build -t farm-management:1.0.1 .

# 2. Update docker-compose.yml
sed -i 's/farm-management:1.0.0/farm-management:1.0.1/g' docker-compose.yml

# 3. Update and restart backend only (maintains database)
docker-compose up -d --no-deps --build backend

# 4. Wait for health check to pass (30-60 seconds)
sleep 60

# 5. Verify new version
curl http://localhost:3000/api

# 6. If rollback needed
git revert HEAD
docker-compose up -d
```

## Production Dockerfile

```dockerfile
# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN yarn install --frozen-lockfile

COPY . .
RUN yarn build

# Runtime stage
FROM node:18-alpine

WORKDIR /app

# Install dumb-init (PID 1 handler)
RUN apk add --no-cache dumb-init

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

EXPOSE 3000

# Run with dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
```

## PostgreSQL Configuration

### Connection String
```
postgresql://user:password@host:5432/database
```

### Recommended Settings (Production)

```sql
-- For better performance
ALTER SYSTEM SET max_connections = 200;
ALTER SYSTEM SET shared_buffers = '4GB';  -- 25% of RAM
ALTER SYSTEM SET effective_cache_size = '12GB';  -- 75% of RAM
ALTER SYSTEM SET work_mem = '20MB';
ALTER SYSTEM SET maintenance_work_mem = '1GB';

-- Index optimization
CREATE INDEX idx_sensor_data_device_created
  ON sensor_data(device_id, created_at DESC);
CREATE INDEX idx_sensor_data_device_type_created
  ON sensor_data(device_id, sensor_type, created_at DESC);
CREATE INDEX idx_command_log_device_created
  ON command_log(device_id, created_at DESC);
CREATE INDEX idx_alert_log_device_created
  ON alert_log(device_id, created_at DESC);

-- Indexes for v1.4 (Pump, Firmware)
CREATE INDEX idx_pump_session_device_created
  ON pump_session(device_id, created_at DESC);
CREATE INDEX idx_coffee_price_date_market
  ON coffee_price(date DESC, market);
CREATE INDEX idx_firmware_update_log_device_created
  ON firmware_update_log(device_id, created_at DESC);

-- Vacuum and analyze
VACUUM ANALYZE;
```

### Backup Strategy

```bash
# Daily backup
pg_dump -h localhost -U postgres -d farm_management > backup_$(date +%Y%m%d).sql

# Automated backup script
#!/bin/bash
BACKUP_DIR="/backups/postgres"
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump -h localhost -U postgres -d farm_management | gzip > $BACKUP_DIR/backup_$DATE.sql.gz
# Keep only last 30 days
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +30 -delete

# Restore from backup
gunzip < backup_20260225.sql.gz | psql -h localhost -U postgres -d farm_management
```

## EMQX Configuration

### MQTT Authentication (Webhook)

EMQX calls `POST /api/emqx/auth` for every client connection. Configure in EMQX:

```
Config → Authentication
Authenticator: HTTP
URL: http://backend:3000/api/emqx/auth
Method: POST
```

### MQTT Authorization (Webhook)

EMQX calls `POST /api/emqx/acl` for every publish/subscribe. Configure:

```
Config → Authorization
Authorizer: HTTP
URL: http://backend:3000/api/emqx/acl
Method: POST
```

### Retention Policy

```
Config → MQTT → Message Retention
Retain Max Paylaod Size: 1MB
Retention Max Messages: 100000
Retention Max Time Interval: 24h
```

### Cluster Mode (Optional, for HA)

```bash
# Join second EMQX node to cluster
docker exec emqx2 /opt/emqx/bin/emqx_ctl cluster join emqx@emqx1
```

## Monitoring & Health Checks

### API Health Endpoint

```bash
GET http://localhost:3000/api

# Returns 200 if healthy, 503 if unhealthy
# Used by Docker health checks and load balancers
```

### Docker Service Health

```bash
# Check all services
docker-compose ps

# View logs
docker-compose logs backend     # Last 50 lines
docker-compose logs -f backend  # Follow mode

# Check specific service
docker-compose exec backend curl http://localhost:3000/api
docker-compose exec postgres psql -U postgres -d farm_management -c "SELECT COUNT(*) FROM device;"
docker-compose exec emqx /opt/emqx/bin/emqx_ctl status
```

### Database Monitoring

```bash
# Connection count
SELECT count(*) FROM pg_stat_activity;

# Slow queries (queries > 1 second)
SELECT mean_exec_time, calls, query
FROM pg_stat_statements
WHERE mean_exec_time > 1000
ORDER BY mean_exec_time DESC;

# Table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

# Index usage
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;
```

### MQTT Metrics

```bash
# Connect to MQTT and check status
docker-compose exec emqx /opt/emqx/bin/emqx_ctl status

# View connected clients
docker-compose exec emqx /opt/emqx/bin/emqx_ctl clients list

# Check broker statistics
docker-compose exec emqx /opt/emqx/bin/emqx_ctl broker stats
```

## Troubleshooting

### Database Connection Issues

**Symptom:** `connect ECONNREFUSED 127.0.0.1:5432`

```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Check logs
docker-compose logs postgres

# Verify connection string
# Ensure DB_HOST matches service name (postgres) in docker-compose
# For local dev: localhost or 127.0.0.1
# For docker network: postgres (service name)

# Test connection manually
psql -h postgres -U postgres -d farm_management -c "SELECT 1"
```

### MQTT Connection Issues

**Symptom:** `connect() timeout` when publishing

```bash
# Check EMQX is running
docker-compose ps emqx

# Check logs
docker-compose logs emqx

# Verify connection string
# MQTT_BROKER_URL=mqtt://localhost:1883 (dev)
# MQTT_BROKER_URL=mqtt://emqx:1883 (docker network)

# Test MQTT connection: use EMQX Dashboard (http://localhost:18083) → Tools → WebSocket Client,
# or any MQTT client connecting to emqx:1883 (e.g. mqtt://emqx:1883 from host, mqtt://localhost:1883 from host)
```

### WebSocket Connection Issues

**Symptom:** WebSocket connection fails from client

```bash
# Check Socket.IO logs
docker-compose logs backend | grep -i socket

# Verify CORS configuration (in main.ts)
# Ensure client origin is in allowedOrigins

# Check WebSocket endpoint
curl -i http://localhost:3000/socket.io/?EIO=4&transport=polling

# If behind proxy, ensure WebSocket upgrade is supported
# Configure nginx or load balancer to support WebSocket
```

### Out of Memory

**Symptom:** Backend process killed, services restart repeatedly

```bash
# Check memory usage
docker stats

# Increase memory limit in docker-compose.yml
services:
  backend:
    deploy:
      resources:
        limits:
          memory: 2G
        reservations:
          memory: 1G

# Restart with new limits
docker-compose up -d
```

### High Database CPU

**Symptom:** PostgreSQL using 100% CPU

```bash
# Check slow queries
SELECT query, calls, mean_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

# Check missing indexes
SELECT * FROM pg_stat_user_indexes WHERE idx_scan = 0;

# VACUUM and ANALYZE
VACUUM ANALYZE;
```

## Scaling Considerations

### Vertical Scaling (Single Server)
- Increase CPU, RAM, and storage on existing server
- Best for small to medium deployments (< 1000 devices)
- Simpler operations but limited growth

### Horizontal Scaling (Multiple Servers)
- Deploy multiple backend instances behind load balancer
- Use external PostgreSQL (RDS, managed service)
- Configure MQTT broker clustering
- Requires Redis for distributed session management

### Load Balancer Configuration

```nginx
upstream backend {
  server backend1:3000;
  server backend2:3000;
  server backend3:3000;
}

server {
  listen 80;
  server_name api.farm.example.com;

  # WebSocket support
  map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
  }

  location / {
    proxy_pass http://backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

## Backup & Disaster Recovery

### Backup Plan
- **Database:** Daily automated backups (30-day retention)
- **Application:** Version controlled in Git (recovery via git checkout)
- **Configuration:** Encrypted environment files backed up securely

### Recovery Procedures

```bash
# Database recovery from backup
gunzip < backup_20260225.sql.gz | psql -d farm_management

# Application recovery
git reset --hard <commit-hash>
docker-compose down
docker-compose up -d

# Configuration recovery
# Restore .env from secure backup
cp /secure-backup/.env .env
docker-compose up -d
```

## Security Checklist

- [ ] All environment variables use strong, random values
- [ ] JWT secrets are > 32 characters
- [ ] Database password is strong (> 12 chars, mixed case, numbers, symbols)
- [ ] HTTPS enabled for API (nginx or reverse proxy with SSL)
- [ ] MQTT uses TLS/SSL (port 8883) in production
- [ ] Firewall rules restrict access (allow only necessary ports)
- [ ] Regular security updates applied (Docker images, Node.js, dependencies)
- [ ] Database backups encrypted and stored off-server
- [ ] CORS only allows trusted origins
- [ ] Rate limiting enabled on API endpoints
- [ ] MQTT ACL properly configured (device isolation)
- [ ] Admin credentials changed from defaults

---

**Document Version:** 1.0
**Last Updated:** 2026-02-25
**Tested Environments:** Ubuntu 22.04, macOS 13+, Windows WSL2
