# Documentation Index

Welcome to the IoT Farm Management Platform documentation. This guide helps you find the right document for your needs.

## Quick Navigation

### New to the Project?
Start here to understand what this platform does and how it works.

1. **[Project Overview & PDR](./project-overview-pdr.md)** - Project vision, features, and requirements
2. **[Codebase Summary](./codebase-summary.md)** - Code organization and module structure
3. **[System Architecture](./system-architecture.md)** - How components interact and data flows

### Setting Up Development Environment?
Get your local environment running quickly.

1. **[Root README](../README.md)** - Quick start guide (5 minutes)
2. **[Deployment Guide](./deployment-guide.md)** - Setup section for local development
3. **[Code Standards](./code-standards.md)** - Before writing your first line of code

### Writing Code?
Reference these while implementing features.

1. **[Code Standards](./code-standards.md)** - Naming conventions, patterns, architecture
2. **[Codebase Summary](./codebase-summary.md)** - Module structure and organization
3. **[System Architecture](./system-architecture.md)** - How components work together

### Deploying to Production?
Follow these guides for deployment and operations.

1. **[Deployment Guide](./deployment-guide.md)** - Setup, deployment, and troubleshooting
2. **[Project Roadmap](./project-roadmap.md)** - Understand project phases and stability
3. **[Code Standards](./code-standards.md)** - Security patterns section

### Managing the Project?
Track progress and plan features.

1. **[Project Roadmap](./project-roadmap.md)** - Phases, timelines, and metrics
2. **[Project Overview & PDR](./project-overview-pdr.md)** - Requirements and success criteria

### Troubleshooting Issues?
Find solutions to common problems.

1. **[Deployment Guide](./deployment-guide.md)** - Comprehensive troubleshooting section
2. **[System Architecture](./system-architecture.md)** - Understand critical data flows
3. **[Code Standards](./code-standards.md)** - Error handling patterns

---

## Documentation by Topic

### Architecture & Design
- **[System Architecture](./system-architecture.md)** - Complete system design with data flows and authentication
- **[Codebase Summary](./codebase-summary.md)** - Module dependencies and code organization

### Implementation & Development
- **[Code Standards](./code-standards.md)** - Coding patterns, conventions, and best practices
- **[Codebase Summary](./codebase-summary.md)** - File organization and quick reference

### Requirements & Planning
- **[Project Overview & PDR](./project-overview-pdr.md)** - Features, requirements, acceptance criteria
- **[Project Roadmap](./project-roadmap.md)** - Development phases and timeline

### Operations & Deployment
- **[Deployment Guide](./deployment-guide.md)** - Local setup, production deployment, troubleshooting
- **[Project Roadmap](./project-roadmap.md)** - Production hardening phase details

---

## Document Details

### [project-overview-pdr.md](./project-overview-pdr.md) (359 lines)
**Purpose:** Define project vision and requirements
**Audience:** Product managers, developers, stakeholders
**Covers:**
- Project vision and user personas
- Core features and functional requirements
- Non-functional requirements (performance, security, scalability)
- Success metrics and acceptance criteria
- Development phases overview

**Key Sections:**
- Vision statement
- Feature descriptions (9 modules)
- Requirements breakdown
- Success metrics
- Acceptance criteria

### [codebase-summary.md](./codebase-summary.md) (434 lines)
**Purpose:** Quick reference for code organization
**Audience:** Developers, architects, code reviewers
**Covers:**
- Module structure and file organization
- Entity and database schema
- Service descriptions
- REST endpoint summary (50+ endpoints)
- WebSocket and MQTT specifications
- Code patterns and conventions

**Key Sections:**
- Module dependency graph
- File organization per module
- Entity relationship summary
- Service class descriptions
- Endpoint summary by module
- Performance considerations

### [code-standards.md](./code-standards.md) (672 lines)
**Purpose:** Implementation guidelines and patterns
**Audience:** All developers
**Covers:**
- Naming conventions (files, classes, functions, variables)
- NestJS architectural patterns
- TypeORM database patterns
- Error handling and security
- Testing patterns
- Code documentation philosophy

**Key Sections:**
- File naming conventions
- Class and function naming
- NestJS patterns (modules, services, controllers)
- Guard and strategy patterns
- Entity design and relationships
- Database optimization
- Error handling (15+ code examples)

### [system-architecture.md](./system-architecture.md) (782 lines)
**Purpose:** Deep technical design and data flows
**Audience:** Architects, senior developers
**Covers:**
- High-level system architecture
- Module dependency details
- Data model (ER diagram)
- Real-time data flows (5 detailed flows)
- Command dispatch (manual and automated)
- Authentication and authorization
- MQTT and WebSocket events

**Key Sections:**
- Architecture overview diagram
- Module dependency graph
- Entity relationship diagram
- Telemetry ingestion flow
- Command dispatch flow
- Device provisioning flow
- Schedule execution flow
- Authentication flow (JWT)
- MQTT device authentication

### [project-roadmap.md](./project-roadmap.md) (413 lines)
**Purpose:** Track project progress and plan features
**Audience:** Product managers, team leads, developers
**Covers:**
- Five development phases
- Phase 1-2 achievements (complete)
- Phase 3-5 planned features
- Release timeline
- Success metrics
- Known constraints and risks

**Key Sections:**
- Phase 1: Core Infrastructure (Complete)
- Phase 2: IoT Integration (Complete)
- Phase 3: Production Hardening (Planned)
- Phase 4: Advanced Features (Planned)
- Phase 5: Scale & Optimization (Planned)
- Feature dependency graph
- Risk mitigation strategies

### [deployment-guide.md](./deployment-guide.md) (690 lines)
**Purpose:** Setup, deployment, and operations
**Audience:** DevOps, operations team, developers
**Covers:**
- Prerequisites and system requirements
- Local development setup (5-minute quick start)
- Environment configuration
- Production deployment process
- Docker and docker-compose files
- PostgreSQL and EMQX configuration
- Monitoring and health checks
- Troubleshooting (6 common issues)
- Scaling strategies
- Backup and disaster recovery

**Key Sections:**
- Quick start commands
- Development environment setup
- Production deployment
- Docker configurations
- Database setup and optimization
- MQTT broker configuration
- Health checks and monitoring
- Comprehensive troubleshooting
- Security checklist (12 points)

---

## How to Use These Docs

### For New Developers
1. Start with [Root README](../README.md) - 5 minute overview
2. Read [Project Overview & PDR](./project-overview-pdr.md) - Understand the why
3. Skim [Codebase Summary](./codebase-summary.md) - Understand the structure
4. Follow [Deployment Guide](./deployment-guide.md) - Get environment running
5. Reference [Code Standards](./code-standards.md) - Write your first code
6. Deep dive [System Architecture](./system-architecture.md) - Understand how it works

### For Code Review
1. Reference [Code Standards](./code-standards.md) - Check naming and patterns
2. Verify with [Codebase Summary](./codebase-summary.md) - Ensure organization
3. Check [System Architecture](./system-architecture.md) - Validate data flows

### For Feature Planning
1. Start with [Project Overview & PDR](./project-overview-pdr.md) - Requirements framework
2. Check [Project Roadmap](./project-roadmap.md) - Dependencies and timeline
3. Reference [System Architecture](./system-architecture.md) - Impact analysis

### For Deployments
1. Follow [Deployment Guide](./deployment-guide.md) - Setup and deployment
2. Check [Project Roadmap](./project-roadmap.md) - Version compatibility
3. Review security checklist - Ensure production readiness

### For Troubleshooting
1. Go to [Deployment Guide](./deployment-guide.md) → Troubleshooting section
2. Check [System Architecture](./system-architecture.md) - Understand the flow
3. Reference [Code Standards](./code-standards.md) - Error handling patterns

---

## Documentation Maintenance

### When to Update Documentation

**After Code Changes:**
- New endpoint added → Update [Codebase Summary](./codebase-summary.md)
- New module created → Update [Codebase Summary](./codebase-summary.md) and [System Architecture](./system-architecture.md)
- New entity added → Update [Codebase Summary](./codebase-summary.md) data model section
- Pattern changed → Update [Code Standards](./code-standards.md)

**Weekly:**
- Update [Project Roadmap](./project-roadmap.md) with progress

**Monthly:**
- Verify all code examples still match implementation
- Update success metrics with actual performance data
- Review and refresh troubleshooting section

**Per Release:**
- Update roadmap with completed features
- Update codebase summary with new counts
- Update deployment guide with lessons learned

### Updating Guidelines

1. **Keep it accurate:** Verify against actual codebase
2. **Keep it concise:** Remove outdated or redundant content
3. **Keep it actionable:** Include examples and procedures
4. **Keep it linked:** Update cross-references
5. **Keep it organized:** Maintain hierarchy and structure

---

## File Organization

```
/home/duc/workspace/nest-websockets-chat-boilerplate/
├── README.md                          (Project overview & quick start)
│
└── docs/
    ├── README.md                      (This file - documentation index)
    ├── project-overview-pdr.md        (Vision, features, requirements)
    ├── codebase-summary.md            (Code organization, modules, endpoints)
    ├── code-standards.md              (Naming, patterns, architecture)
    ├── system-architecture.md         (Design, flows, authentication)
    ├── project-roadmap.md             (Phases, timeline, metrics)
    └── deployment-guide.md            (Setup, deployment, troubleshooting)
```

---

## Search Tips

### Finding Information About...

**A specific module?**
→ Search [Codebase Summary](./codebase-summary.md) module structure section

**A REST endpoint?**
→ Search [Codebase Summary](./codebase-summary.md) endpoint summary or [Root README](../README.md)

**How data flows?**
→ See [System Architecture](./system-architecture.md) data flows section

**How to write code?**
→ Reference [Code Standards](./code-standards.md) with examples

**How to deploy?**
→ Follow [Deployment Guide](./deployment-guide.md) step-by-step

**What's planned?**
→ Check [Project Roadmap](./project-roadmap.md) phases section

**Why a feature exists?**
→ Read [Project Overview & PDR](./project-overview-pdr.md) features section

**How to fix an error?**
→ See [Deployment Guide](./deployment-guide.md) troubleshooting section

---

## Quick Links

- **Source Code:** `/home/duc/workspace/nest-websockets-chat-boilerplate/src/`
- **Project Root:** `/home/duc/workspace/nest-websockets-chat-boilerplate/`
- **Docker Compose:** `/home/duc/workspace/nest-websockets-chat-boilerplate/docker-compose.yml`
- **Environment:** `/home/duc/workspace/nest-websockets-chat-boilerplate/.env.example`
- **Build Output:** `/home/duc/workspace/nest-websockets-chat-boilerplate/dist/`

---

**Last Updated:** 2026-02-25
**Documentation Version:** 1.0
**Project Phase:** 2 (Complete)
