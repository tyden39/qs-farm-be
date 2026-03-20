# Brainstorm: Zone Hierarchy Refactor

**Date:** 2026-03-20
**Status:** Agreed — ready for implementation plan

## Problem Statement

Current flat hierarchy `User → Farm → Device` needs refactoring to support multi-level management with "Zone" (khu đất) layer between Farm and Device. Additionally need GPS coordinates, irrigation mode-aware thresholds, and hierarchical config inheritance with override capability.

## Requirements Summary

1. **New hierarchy**: User → N Farm → N Zone → N Device (1:N at each level)
2. **GPS coordinates**: Farm/Zone store polygon (array of lat/lng), Device stores single point
3. **Zone has**: irrigationMode, controlMode, checkAll flag
4. **Config inheritance**: Zone → Device. If device has no config → use zone's. checkAll=true → force zone config (soft override: device config preserved but runtime uses zone)
5. **Threshold per irrigationMode**: Same sensor type has different thresholds depending on active irrigation mode (SPRAY vs DRIP vs ROOT vs NORMAL)
6. **Pump control**: Zone-level (sends cmd to all devices in zone) + Device-level. NO farm-level pump control.
7. **Schedule**: Support zone-level schedules (existing device/farm schedules remain)

## Agreed Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Zone ↔ Device | 1-to-many | Each device belongs to exactly 1 zone |
| checkAll behavior | Soft override | Device config preserved but ignored at runtime. Tắt checkAll → device config sống lại |
| Threshold per irrigationMode | Separate entity: ZoneSensorConfig + ZoneThreshold | Clear separation, explicit inheritance |
| Device FK | Keep both farmId + zoneId (denormalized) | Fast queries, farmId synced when zone changes |
| Config levels | Zone → Device only (Farm has no irrigationMode/controlMode) | Simpler, Farm is organizational grouping |
| Pump scope | Zone + Device only, zone sends to ALL devices in zone | Farm-level pump removed |
| Coordinates | Farm/Zone: jsonb array of {lat,lng}. Device: 2 float columns | Polygon for map boundaries |

## Data Model

### New Entities

**Zone**
```
id (uuid PK), farmId (FK), name, image,
coordinates (jsonb: {lat,lng}[]),
irrigationMode (enum: NORMAL/SPRAY/ROOT/DRIP),
controlMode (enum: AUTO/MANUAL/SCHEDULE),
checkAll (boolean, default false),
pumpEnabled (boolean),
createdAt, updatedAt
```

**ZoneSensorConfig**
```
id (uuid PK), zoneId (FK), sensorType (enum),
enabled (boolean), mode (enum), unit (varchar),
createdAt, updatedAt
Unique: (zoneId, sensorType)
```

**ZoneThreshold**
```
id (uuid PK), zoneSensorConfigId (FK), level (enum),
irrigationMode (enum, nullable),
minThreshold (float), maxThreshold (float), action (varchar),
createdAt, updatedAt
Unique: (zoneSensorConfigId, level, irrigationMode)
```

### Modified Entities

**Farm**: +coordinates (jsonb)
**Device**: +zoneId (FK nullable), +latitude (float), +longitude (float), +irrigationMode (nullable), +controlMode (nullable). Keep farmId.
**SensorThreshold**: +irrigationMode (nullable). Unique changes to (sensorConfigId, level, irrigationMode)
**DeviceSchedule**: +zoneId (FK nullable)

### Resolution Logic

```
resolveConfig(device, zone):
  if zone.checkAll:
    return { irrigationMode: zone.irrigationMode, controlMode: zone.controlMode }
  return {
    irrigationMode: device.irrigationMode ?? zone.irrigationMode,
    controlMode: device.controlMode ?? zone.controlMode
  }

resolveThreshold(sensorConfig, activeIrrigationMode, zone):
  if zone.checkAll:
    t = ZoneThreshold(zone, sensorType, level, activeIrrigationMode)
    return t ?? ZoneThreshold(zone, sensorType, level, null)

  t = SensorThreshold(sensorConfig, level, activeIrrigationMode)
  t = t ?? SensorThreshold(sensorConfig, level, null)
  t = t ?? ZoneThreshold(zone, sensorType, level, activeIrrigationMode)
  return t

pumpToggle(zoneId, action):
  devices = Device.findBy({ zoneId })
  forEach → SyncService.sendCommandToDevice(device.id, { pump: action })
```

## Module Impact

| Module | Changes |
|--------|---------|
| FarmModule | +coordinates, +zone CRUD endpoints |
| ZoneModule (NEW) | Full CRUD, config management, pump toggle, ZoneSensorConfig/Threshold |
| DeviceModule | +zoneId, +lat/lng, +irrigationMode/controlMode override |
| SensorModule | Resolution logic, threshold eval with irrigationMode, zone fallback |
| ScheduleModule | +zoneId support, zone-level schedule execution |
| PumpModule | Zone-level pump toggle |
| SyncService | Config resolution before threshold evaluation |

## Risks

- **Migration**: Existing devices have no zone → need migration strategy (nullable zoneId initially)
- **Denormalized farmId**: Must sync when device moves between zones/farms
- **Threshold resolution performance**: Multiple fallback queries → consider caching
- **checkAll toggle**: Need to emit events/notify connected clients when checkAll changes

## Next Steps

→ Create implementation plan with phased approach
