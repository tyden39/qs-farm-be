# Simple Device Onboarding Flow

## Overview

A basic flow for onboarding a new IoT device to the farm platform.

## Flow Diagram

```mermaid
flowchart TD
    A[Device Powers On] --> B[Device publishes to provision/new]
    B --> C{Backend receives request}
    C --> D[Generate pairing token]
    D --> E[Respond on provision/resp/nonce]
    E --> F[User scans QR / enters token in app]
    F --> G{Token valid?}
    G -->|Yes| H[Pair device with farm]
    G -->|No| I[Show error, retry]
    I --> F
    H --> J[Device receives MQTT auth token]
    J --> K[Device connects to MQTT broker]
    K --> L[Device starts sending telemetry]
    L --> M[SyncService bridges to WebSocket]
    M --> N[Dashboard shows live data]
```

## Steps

1. **Power On** - Device boots and connects to network
2. **Provision Request** - Device publishes to `provision/new` topic
3. **Token Generation** - Backend generates a 24h pairing token
4. **Pairing** - User enters token in mobile app with target farmId
5. **Authentication** - Device gets MQTT credentials
6. **Telemetry** - Device starts streaming sensor data
7. **Dashboard** - Real-time data visible on web/mobile

## Status Legend

| Status | Meaning |
|--------|---------|
| PENDING | Device registered, not yet paired |
| PAIRED | Token accepted, awaiting first connection |
| ACTIVE | Device online and sending data |
| DISABLED | Manually turned off by user |
