# IoT Farm Management Platform

A comprehensive, real-time IoT farm management system built with NestJS, PostgreSQL, EMQX MQTT broker, and Socket.IO WebSocket. Enables farm operators to manage IoT devices, monitor sensor data in real-time, set automated thresholds and alerts, and schedule device commands.

## Overview

This platform combines REST APIs with dual real-time transport (MQTT for IoT devices + WebSocket for web/mobile clients) to deliver a unified farm management solution. Key capabilities include device provisioning, sensor data aggregation, automated threshold alerts, command scheduling, and comprehensive farm dashboards.

**Current Status:** Phase 2 Complete - Full IoT integration with device management, sensor monitoring, threshold alerts, and scheduling.

## Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| **Framework** | NestJS | 8.x |
| **Database** | PostgreSQL | 14+ |
| **ORM** | TypeORM | 0.2.41 |
| **Real-time (Clients)** | Socket.IO | 4.4+ |
| **Real-time (Devices)** | MQTT | 5.14.1 |
| **MQTT Broker** | EMQX | 5.4.0 |
| **Authentication** | JWT + Passport | 8.x |
| **Validation** | class-validator | 0.13.2 |
| **API Docs** | Swagger/OpenAPI | 5.1.5 |
| **Runtime** | Node.js | 18+ |

## Quick Start

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- Git

### Setup & Run

```bash
# Clone repository
git clone <repo-url>
cd nest-websockets-chat-boilerplate

# Install dependencies
yarn install

# Copy environment variables
cp .env.example .env

# Start Docker containers (PostgreSQL + EMQX)
docker-compose up -d

# Run development server
yarn start:dev
```

Server runs at `http://localhost:3000`
API docs available at `http://localhost:3000/api`
EMQX Dashboard at `http://localhost:18083`

### Available Commands

```bash
yarn start:dev              # Development with hot reload
yarn build                  # Production build (outputs to dist/)
yarn start:prod             # Run production build
yarn lint                   # ESLint with auto-fix
yarn format                 # Prettier formatting
yarn test                   # Run unit tests (Jest)
yarn test:watch             # Unit tests in watch mode
yarn test:e2e               # End-to-end tests
yarn test:cov               # Tests with coverage report
```

## Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_NAME=postgres
DB_PASS=your-password

# JWT (generate random secrets)
JWT_ACCESS_SECRET=your-access-secret-key
JWT_REFRESH_SECRET=your-refresh-secret-key
JWT_ACCESS_EXPIRE=60m
JWT_REFRESH_EXPIRE=30d

# MQTT Broker (EMQX)
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=
MQTT_PASSWORD=

# EMQX Dashboard (optional, for admin access)
EMQX_DASHBOARD_URL=http://localhost:18083
EMQX_API_KEY=
EMQX_API_SECRET=

# Environment
NODE_ENV=development
```

See [CLAUDE.md](./CLAUDE.md) for detailed environment and architecture reference.

## Project Structure

```
src/
├── app.module.ts          # Main application module
├── main.ts                # Application bootstrap
├── auth/                  # Authentication (JWT, Passport)
├── user/                  # User management & profiles
├── farm/                  # Farm entities & management
├── device/                # Device management & MQTT/WebSocket gateway
├── sensor/                # Sensor data, thresholds, alerts
├── schedule/              # Device command scheduling
├── provision/             # IoT device provisioning & pairing
├── emqx/                  # EMQX webhook integration
├── files/                 # File uploads & storage
├── utils/                 # Common utilities & pipes
└── config/                # Configuration management
```

## Key Features

### Device Management
- Device registration, status tracking, and remote pairing
- Automatic device provisioning via MQTT provision flow
- Device token regeneration and unpair operations
- Status monitoring (PENDING, PAIRED, ACTIVE, DISABLED)

### Real-time Monitoring
- MQTT device telemetry → PostgreSQL + WebSocket broadcast
- Live sensor data streaming to web/mobile clients via Socket.IO
- Device status updates and command responses
- Real-time alert notifications on threshold breaches

### Sensor Data & Thresholds
- Multi-type sensor support (pressure, flow, temperature, moisture, current)
- Configurable threshold levels (WARNING, CRITICAL) with MIN/MAX actions
- Automated threshold evaluation with anti-spam (30s cooldown)
- Alert history and acknowledgment tracking
- Device-level and farm-level sensor analytics

### Scheduling
- Recurring schedules (weekday + time-based, timezone-aware)
- One-time scheduled commands with automatic disabling after execution
- Farm-wide or single-device targeting
- Automatic retry for missed executions
- Command history and execution logging

### User & Farm Management
- User registration, authentication, password reset
- JWT dual-token strategy (accessToken + refreshToken)
- Role-based access (farm scoping, admin privilege)
- Farm creation and user association
- User profile management with avatar uploads

### EMQX Integration
- MQTT device authentication via webhook (`/api/emqx/auth`)
- Topic ACL enforcement for device isolation and farm scoping
- Automatic ACL updates on device state changes

## API Documentation

Complete API documentation (Swagger/OpenAPI) available at:
```
GET http://localhost:3000/api
```

Key API endpoints:
- `POST /auth/*` - Authentication & password reset
- `GET/PATCH /user/*` - User profile management
- `GET/POST /farm/*` - Farm CRUD operations
- `GET/POST /device/*` - Device management & commands
- `GET/POST /schedule/*` - Device scheduling
- `GET /sensor/*` - Sensor data, thresholds, analytics

## Real-time Events (WebSocket)

Connect to Socket.IO namespace `/device` with JWT token:

```javascript
const socket = io('http://localhost:3000/device', {
  auth: { token: accessToken }
});

// Subscribe to device telemetry
socket.emit('subscribeToDevice', { deviceId: 'uuid' });

// Listen for updates
socket.on('deviceData', (data) => { /* telemetry */ });
socket.on('deviceStatus', (status) => { /* status change */ });
socket.on('deviceAlert', (alert) => { /* threshold alert */ });

// Send command to device
socket.emit('sendCommand', {
  deviceId: 'uuid',
  command: 'SET_PUMP_STATE',
  params: { state: 'ON' }
});
```

## Documentation

Detailed documentation available in `/docs`:
- **[Project Overview & PDR](./docs/project-overview-pdr.md)** - Vision, features, requirements
- **[Codebase Summary](./docs/codebase-summary.md)** - File organization and module details
- **[Code Standards](./docs/code-standards.md)** - Conventions, patterns, architecture
- **[System Architecture](./docs/system-architecture.md)** - High-level design and data model
- **[Project Roadmap](./docs/project-roadmap.md)** - Development phases and milestones
- **[Deployment Guide](./docs/deployment-guide.md)** - Setup, deployment, troubleshooting

## Development Workflow

1. **Feature Development:** Create feature branch, implement with tests
2. **Code Review:** Request review via PR
3. **Testing:** Run `yarn test` before merge
4. **Documentation:** Update relevant docs in `/docs`
5. **Deployment:** Deploy to staging/production via Docker

## Docker Deployment

### Development
```bash
docker-compose -f docker-compose-dev.yml up
```

### Production
```bash
docker-compose up -d
```

Includes:
- PostgreSQL 14 (port 5432)
- EMQX 5.4 (MQTT 1883, WebSocket 8083, Dashboard 18083)
- NestJS backend (port 3000)

Health checks configured for all services.

## Testing

```bash
# Unit tests
yarn test

# Watch mode
yarn test:watch

# Coverage report
yarn test:cov

# E2E tests
yarn test:e2e
```

## Troubleshooting

### Database Connection Issues
- Verify PostgreSQL running: `docker-compose ps`
- Check `DB_HOST`, `DB_PORT`, `DB_USERNAME` in `.env`
- Ensure database exists: `createdb <DB_NAME>`

### MQTT Connection Failures
- Verify EMQX running and accessible at `MQTT_BROKER_URL`
- Check MQTT credentials if authentication enabled
- Review Docker logs: `docker-compose logs emqx`

### WebSocket Connection Issues
- Confirm JWT token is valid and not expired
- Check Socket.IO CORS settings match client origin
- Verify client connecting to correct namespace `/device`

### Device Provisioning Failures
- Check device serial number format and uniqueness
- Verify device can reach MQTT broker
- Review provisioning token expiry (24 hours)

## Support & Contributing

For issues, feature requests, or contributions:
1. Open an issue with detailed reproduction steps
2. Create feature branch following naming convention
3. Submit PR with tests and documentation updates
4. Ensure CI/CD pipeline passes before merge

## License

Proprietary - Farm Management Platform
