# ESP OTA Firmware Update Flow

## Overview

End-to-end flow for pushing firmware updates to ESP32 devices over-the-air via the QS Farm platform.

## Actors

| Actor | Transport | Role |
|-------|-----------|------|
| Admin | REST API | Uploads & publishes firmware, triggers deploy |
| Mobile App | WebSocket (Socket.IO) | Receives notifications, monitors progress |
| ESP Device | MQTT + HTTP | Receives commands, downloads binary, reports status |

## Flow Diagram

```mermaid
sequenceDiagram
    participant Admin
    participant Server
    participant DB
    participant Mobile
    participant ESP

    Note over Admin,ESP: Phase 1 — Upload & Publish
    Admin->>Server: POST /firmware/upload (.bin + version + model)
    Server->>Server: Compute MD5 checksum
    Server->>DB: Save firmware record (unpublished)
    Server-->>Admin: 201 Created (firmware metadata)

    Admin->>Server: PATCH /firmware/:id/publish
    Server->>DB: Set isPublished = true
    Server->>Mobile: WS emit "firmwarePublished" (version, notes)
    Server-->>Admin: 200 OK

    Note over Admin,ESP: Phase 2 — Deploy to Devices
    Admin->>Server: POST /firmware/:id/deploy {deviceIds or farmId}
    Server->>DB: Create FirmwareUpdateLog (PENDING) per device
    Server->>ESP: MQTT cmd → device/:id/cmd {OTA_UPDATE, firmwareId, checksum}
    Server->>Mobile: WS emit "firmwareDeploying" (deviceIds)
    Server-->>Admin: 200 OK (deployment initiated)

    Note over Admin,ESP: Phase 3 — Device Downloads & Installs
    ESP->>Server: GET /firmware/check?model=esp32&current=1.0.0
    Server-->>ESP: {available: true, firmwareId, version, checksum}

    ESP->>Server: GET /firmware/download/:id
    Server-->>ESP: Binary stream (.bin file)

    ESP->>ESP: Verify MD5 checksum
    ESP->>ESP: Write to OTA partition
    ESP->>ESP: Reboot

    Note over Admin,ESP: Phase 4 — Status Reporting
    ESP->>Server: POST /firmware/report {deviceId, firmwareId, status, message}
    Server->>DB: Update FirmwareUpdateLog (SUCCESS/FAILED)
    Server->>Mobile: WS emit device status update
```

## Simplified Flowchart

```mermaid
flowchart TD
    A[Admin uploads .bin firmware] --> B[Server saves file + computes MD5]
    B --> C[Admin publishes firmware version]
    C --> D[Mobile app notified via WebSocket]
    C --> E[Admin deploys to target devices/farm]
    E --> F[Server sends OTA_UPDATE command via MQTT]
    F --> G[ESP receives command]
    G --> H[ESP checks for update via HTTP]
    H --> I[ESP downloads .bin file]
    I --> J{MD5 checksum match?}
    J -->|Yes| K[Write to OTA partition]
    J -->|No| L[Report FAILED]
    K --> M[Reboot device]
    M --> N[Device reports SUCCESS]
    N --> O[Server updates log + notifies mobile]
    L --> O
```

## MQTT Topics Used

| Topic | Direction | Purpose |
|-------|-----------|---------|
| `device/{deviceId}/cmd` | Server → Device | Send OTA_UPDATE command |
| `device/{deviceId}/status` | Device → Server | Device status (updating/updated) |
| `device/{deviceId}/resp` | Device → Server | Command response/ack |

## HTTP Endpoints (No Auth — Device Use)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/firmware/check?model=X&currentVersion=Y` | Check if update available |
| `GET` | `/firmware/download/:id` | Download firmware binary |
| `POST` | `/firmware/report` | Report update result |

## REST Endpoints (Auth Required — Admin)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/firmware/upload` | Upload new firmware .bin |
| `GET` | `/firmware` | List all firmware versions |
| `PATCH` | `/firmware/:id/publish` | Mark firmware as published |
| `POST` | `/firmware/:id/deploy` | Push update to devices/farm |

## Update Status Lifecycle

```mermaid
stateDiagram-v2
    [*] --> PENDING: Deploy initiated
    PENDING --> DOWNLOADING: Device starts download
    DOWNLOADING --> INSTALLING: Download complete, checksum OK
    DOWNLOADING --> FAILED: Checksum mismatch / network error
    INSTALLING --> SUCCESS: Reboot + report OK
    INSTALLING --> FAILED: Flash write error
    SUCCESS --> [*]
    FAILED --> [*]
```
