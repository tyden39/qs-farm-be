# ESP OTA Firmware Update Feature

**Date:** 2026-02-27
**Status:** Draft
**Branch:** master

---

## Overview

Add OTA (Over-The-Air) firmware update capability for ESP devices. Admin uploads `.bin` firmware files, marks versions as published to notify mobile clients, and can target specific devices/farms for immediate update.

## Requirements Summary

1. **Upload firmware** — Simple REST endpoint to upload `.bin` files with version metadata
2. **Publish & notify** — Mark version as published → server notifies mobile via WebSocket
3. **Target update** — Select specific device(s) or farm to push OTA update directly from upload/management interface
4. **Device check** — Device can check for latest firmware version via HTTP (no auth required)
5. **Download** — Device downloads firmware binary via HTTP with checksum validation
6. **Update reporting** — Device reports update success/failure

## Architecture

```
Admin (REST)                    Mobile (WebSocket)           ESP Device (MQTT + HTTP)
    │                                │                            │
    ├─ POST /firmware/upload ────────┤                            │
    ├─ PATCH /firmware/:id/publish ──┼── firmwarePublished ──────→│ (notification)
    ├─ POST /firmware/:id/deploy ────┼── firmwareDeploying ──────→│
    │   (deviceIds / farmId)         │                            │
    │                                │                            ├─ GET /firmware/check
    │                                │                            ├─ GET /firmware/download/:id
    │                                │                            ├─ OTA_UPDATE via MQTT cmd
    │                                │                            └─ POST /firmware/report
    │                                │                            │
    │                                │←── deviceStatus (updating) ┤
    │                                │←── deviceStatus (updated)  ┘
```

## Data Model

```
Firmware
├── id: UUID (PK)
├── version: VARCHAR(20) UNIQUE
├── hardwareModel: VARCHAR(50)        — e.g. "esp32", "esp32-s3"
├── fileName: VARCHAR(255)
├── filePath: VARCHAR(255)            — disk path to .bin
├── fileSize: INT
├── checksum: VARCHAR(64)             — MD5 hash
├── releaseNotes: TEXT (nullable)
├── isPublished: BOOLEAN (default false)
├── publishedAt: TIMESTAMP (nullable)
├── createdBy: UUID (FK → User)
├── createdAt: TIMESTAMP
├── updatedAt: TIMESTAMP
└── INDEX(hardwareModel, version)

FirmwareUpdateLog
├── id: UUID (PK)
├── firmwareId: UUID (FK → Firmware)
├── deviceId: UUID (FK → Device)
├── previousVersion: VARCHAR(20) (nullable)
├── status: ENUM (pending, downloading, success, failed, rollback)
├── errorMessage: TEXT (nullable)
├── duration: INT (ms, nullable)
├── reportedAt: TIMESTAMP (nullable)
├── createdAt: TIMESTAMP
└── INDEX(deviceId, createdAt)
```

## Phases

| # | Phase | Status | Priority | Effort |
|---|-------|--------|----------|--------|
| 1 | [Entity & Module Setup](./phase-01-entity-module-setup.md) | Pending | High | Small |
| 2 | [Upload & CRUD Endpoints](./phase-02-upload-crud-endpoints.md) | Pending | High | Medium |
| 3 | [Publish & WebSocket Notify](./phase-03-publish-websocket-notify.md) | Pending | High | Small |
| 4 | [Device Check & Download](./phase-04-device-check-download.md) | Pending | High | Medium |
| 5 | [Deploy to Devices via MQTT](./phase-05-deploy-mqtt.md) | Pending | High | Medium |
| 6 | [Update Reporting & Logs](./phase-06-update-reporting.md) | Pending | Medium | Small |
| 7 | [Mobile-Initiated Update](./phase-07-mobile-initiated-update.md) | Pending | High | Small |

## Key Dependencies

- Existing `DeviceModule` (MqttService, SyncService, DeviceGateway)
- Existing `FilesModule` pattern (Multer disk storage)
- EventEmitter for decoupled communication
- Device entity `hardwareVersion` field for model matching

## MQTT Topics (New)

- `device/{deviceId}/cmd` — existing, reused for `OTA_UPDATE` command
- `device/{deviceId}/resp` — existing, reused for update result

## WebSocket Events (New)

- `firmwarePublished` — broadcast to all clients when firmware published
- `firmwareDeploying` — sent to device room(s) when deploy initiated
- `firmwareUpdateStatus` — per-device update progress/result
- `requestFirmwareUpdate` — mobile → server, trigger update for user's devices
- `firmwareUpdateAck` — server → mobile, deploy initiated confirmation
- `firmwareUpdateError` — server → mobile, deploy failed (auth/validation)
