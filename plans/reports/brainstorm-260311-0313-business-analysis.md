# Business Analysis - QS Farm IoT Platform

**Date:** 2026-03-11
**Context:** Team 2 nguoi (1 backend, 1 mobile+hardware), chua co user, target SaaS
**Status:** Phase 2 complete, Phase 3 planned

---

## 1. Product Identity

### Hien trang: "IoT Farm Management Platform"
Docs mo ta day la 1 platform tong quat, nhung thuc te sensor types cho thay no la **he thong giam sat bom tuoi**:

| Sensor Type | Vi | Nghia business |
|---|---|---|
| WATER_PRESSURE | Ap suat nuoc | Giam sat ap luc bom |
| WATER_FLOW | Luu luong nuoc | Luong nuoc dang bom |
| PUMP_TEMPERATURE | Nhiet do may bom | Suc khoe bom |
| SOIL_MOISTURE | Do am dat | Khi nao can tuoi |
| ELECTRICAL_CURRENT | Dong dien | Dien nang tieu thu |
| ELECTRICAL_PHASE | Pha dien | Trang thai nguon dien 3 pha |

### Van de
- **Identity crisis**: Platform vs Product. Dang build platform nhung domain la pump/irrigation monitoring
- Platform = nhieu time, nhieu abstraction, nhieu complexity
- Product = focused, nhanh ra thi truong, de communicate gia tri

### De xuat
Rebrand thanh **"Smart Pump Monitoring & Irrigation Control System"** hoac tuong tu. Specific hon, value prop ro rang hon.

---

## 2. Architecture vs Business Value

### Thong ke hien tai

| Metric | So luong |
|---|---|
| Modules | 12 (Auth, User, Farm, Device, Sensor, Schedule, Provision, EMQX, Notification, Firmware, Files, App) |
| Entities | 15 |
| REST Endpoints | 50+ |
| DTOs | 37 |
| Services | 14 |
| Controllers | 11 |
| Transport protocols | 3 (REST + WebSocket + MQTT) |
| Real-time flows | 5 (telemetry, command, provision, schedule, alert) |

### Phan tich: Infrastructure nang, domain nhe

**Infrastructure da co (rat nhieu):**
- JWT dual-token auth + password reset + OTP
- MQTT broker integration + webhook auth/ACL
- WebSocket gateway + room management
- Device provisioning flow (MQTT-based)
- FCM push notifications
- Firmware OTA update system
- File upload service
- Event-driven architecture
- Command logging + audit trail
- Schedule engine (recurring + one-time)
- Threshold alert system + anti-spam

**Domain intelligence (rat it):**
- Threshold chi co MIN/MAX don gian
- Khong co pump health scoring
- Khong co irrigation logic (tuoi dua tren soil moisture trend)
- Khong co water consumption tracking
- Khong co energy cost calculation
- Khong co pump efficiency analysis (flow/pressure/current correlation)
- Khong co trend analysis / anomaly detection
- Khong co zone management (vung A tuoi khac vung B)

### Ket luan
> System dang lam "plumbing" (ha tang) rat tot nhung thieu "brain" (tri tue domain).
> Nhu mot con robot co than the manh me nhung chua co bo nao.

---

## 3. Data Model Analysis

### Farm Entity - Qua mong

```
Hien tai:
  Farm { id, name, image, userId }

Thieu gi cho SaaS:
  - location/GPS coordinates
  - dien tich (hectares)
  - loai cay trong
  - nguon nuoc (gieng, song, ho)
  - timezone
  - subscription plan
  - billing info
  - multiple users/roles
```

### Device Entity - Khong biet minh la gi

```
Hien tai:
  Device { id, name, imei, serial, status, farmId, ... }

Van de:
  - Khong co device TYPE (bom? van? sensor node? controller?)
  - Khong co zone/area assignment
  - Khong co metadata ve pump specs (cong suat, hang san xuat)
  - Tat ca device treated giong nhau
```

### Thieu entities quan trong cho business:

| Entity can thiet | Muc dich |
|---|---|
| Zone/Area | Chia farm thanh cac khu vuc tuoi |
| WaterSource | Nguon nuoc (gieng, ho, song) |
| IrrigationCycle | Chu ky tuoi (bat dau, ket thuc, luong nuoc) |
| EnergyLog | Theo doi dien nang tieu thu |
| PumpProfile | Thong so bom (cong suat, luu luong max) |
| Subscription | Goi dich vu SaaS |
| Organization | Multi-tenant, multi-user |

---

## 4. API Surface Analysis

### Endpoint count by module:

| Module | Endpoints | Complexity |
|---|---|---|
| Auth | 8 | Medium - JWT, OTP, password flows |
| User | 6 | Low - CRUD + avatar |
| Farm | 5 | Low - CRUD |
| Device | 9 | Medium - CRUD + command + token |
| Sensor | 22+ | High - config, threshold, data, stats, reports |
| Schedule | 6 | Medium - CRUD + toggle |
| Provision | 7 | Medium - pairing flow |
| EMQX | 2 | Low - webhooks |
| Notification | 2 | Low - token register/unregister |
| Firmware | ~6 | Medium - upload, deploy, check, logs |
| Files | 2 | Low - upload/download |

### Van de
- **Sensor module qua to**: 22+ endpoints = lam qua nhieu viec (config + threshold + data + stats + reports + alerts + commands). Nen tach.
- **Report endpoints thieu focus**: Co stats/timeseries/comparison nhung khong co business-level insights
- **Khong co multi-tenancy**: Farm.userId = 1 owner. Khong co invite user, roles, permissions

---

## 5. Roadmap Analysis

### Phase 3 (Production Hardening) - REASONABLE
- DB migrations, monitoring, rate limiting, health checks
- **OK, can thiet truoc khi co user**

### Phase 4 (Advanced Features) - QUA RONG

| Feature | Effort | ROI cho giai doan nay |
|---|---|---|
| Email alerts | Medium | High - co the lam |
| SMS (Twilio) | Medium | Low - chi phi cao, it user VN dung |
| Analytics dashboards | High | Medium - can nhung scope qua rong |
| Mobile SDKs | Very High | Low - da co REST + WS, khong can SDK rieng |
| Reporting engine (PDF/CSV) | High | Medium - nice-to-have |
| Weather API | Medium | Medium - hay nhung chua thiet yeu |
| ML scheduling | Very High | Low - chua co data de train |
| Third-party integrations | High | Low - chua co user, integrate voi ai? |

### Phase 5 (Scale) - VIEN VONG VOI TEAM 2 NGUOI

| Feature | Thuc te |
|---|---|
| Horizontal scaling | Chua can khi chua co user |
| Multi-region | Chua can |
| GraphQL | Khong can, REST du |
| ML anomaly detection | Chua co data |
| Enterprise SSO/SAML | Chua co enterprise customer |

### Ket luan Roadmap
> Phase 4-5 la "dream big" nhung khong realistic voi team 2 nguoi va 0 user.
> Can focus vao: **ra san pham dung duoc** truoc, scale sau.

---

## 6. Competitive Landscape (Reference)

### Doi thu tiem nang trong nong nghiep thong minh VN:
- **MimosaTEK**: Giai phap tuoi thong minh, da co khach
- **IoT Viet Nam**: Platform IoT chung
- **Hachi**: Smart farming, chay boi tren IoT
- Cac giai phap tu cac truong dai hoc (BKDN, HCMUT)

### Differentiation can co:
- UX/UI tot hon (mobile-first cho nong dan)
- Gia ca phai chang
- Ho tro hardware rieng (team co nguoi lam hardware)
- Vietnamese-first (ngon ngu, UX phu hop)

---

## 7. SaaS Readiness Assessment

| Yeu cau SaaS | Trang thai | Muc do |
|---|---|---|
| Multi-tenancy | THIEU | CRITICAL - Farm chi co 1 owner |
| Subscription/billing | THIEU | CRITICAL - Khong co plan/pricing |
| User roles & permissions | THIEU | HIGH - Chi co farm owner |
| Onboarding flow | THIEU | HIGH - UX dau tien cho user moi |
| Usage metrics/limits | THIEU | MEDIUM - Khong track usage |
| Admin dashboard | THIEU | MEDIUM - Khong co admin view |
| Data isolation | CO 1 PHAN | MEDIUM - Farm-scoped nhung chua du |
| API rate limiting | THIEU | MEDIUM - Plan o Phase 3 |
| Documentation/help | CO 1 PHAN | LOW - Co Swagger, thieu user docs |
| Auth system | CO | OK |
| Real-time monitoring | CO | OK |
| Push notifications | CO | OK |
| Device management | CO | OK |

### Ket luan SaaS
> He thong co infrastructure tot nhung **thieu tat ca cac yeu to kinh doanh** de ban duoc.
> Multi-tenancy va billing la 2 gap lon nhat.

---

## 8. Technical Debt Summary

| Debt | Severity | Impact |
|---|---|---|
| NestJS 8 (hien tai la v10+) | Medium | Khong co features moi, security patches |
| TypeORM 0.2.41 (hien tai la 0.3+) | Medium | Breaking changes khi upgrade |
| `synchronize: true` | HIGH | Data loss risk khi deploy production |
| In-memory anti-spam state | Medium | Mat state khi restart |
| Khong co DB migrations | HIGH | Khong rollback duoc schema changes |
| Sensor module qua to | Medium | Kho maintain, test, extend |
| Khong co test coverage | HIGH | Thay doi gi cung rui ro |

---

## 9. So sanh Effort vs Impact

```
                    HIGH IMPACT
                        |
   [Multi-tenant]  [Billing]
   [DB Migrations] [User Roles]
                        |
   [Zone Mgmt]    [Pump Health]
   [Water Stats]   [Energy Track]
                        |
LOW EFFORT ─────────────┼───────────── HIGH EFFORT
                        |
   [Weather API]   [ML Features]
   [SMS Alerts]    [Mobile SDK]
                        |
   [GraphQL]       [Multi-region]
   [Enterprise]    [Reporting PDF]
                        |
                    LOW IMPACT
```

### Priority matrix:
1. **Do ngay** (high impact, reasonable effort): DB migrations, user roles, zone management
2. **Do som** (high impact, medium effort): Multi-tenancy, billing, pump health analytics
3. **Do sau** (medium impact, medium effort): Weather API, water consumption stats, email alerts
4. **Bo/hoan** (low impact, high effort): ML, GraphQL, multi-region, enterprise SSO, mobile SDK

---

## 10. De xuat Huong di

### Option A: Focus Product (Recommended)
- **Rebrand**: Tu "IoT Platform" thanh "Smart Pump Monitor"
- **Add domain intelligence**: Pump health, irrigation logic, water/energy tracking
- **Add SaaS essentials**: Multi-tenant, billing, user roles
- **Giam scope**: Bo Phase 5, gon Phase 4
- **Timeline**: 2-3 thang ra MVP co the ban duoc

### Option B: Platform Play
- Giu dinh huong platform tong quat
- Ho tro nhieu loai sensor/device khac nhau
- Can team lon hon (4+ dev)
- Lau hon de ra thi truong (6-12 thang)
- Rui ro: canh tranh voi cac platform lon (AWS IoT, Azure IoT Hub)

### Option C: Pivot thanh Solution
- Ban theo goi: hardware + software + lap dat
- Focus 1 use case cu the (VD: tuoi ca phe Tay Nguyen)
- Giam yeu cau tech, tang yeu cau sales
- Phu hop voi team nho

---

## 11. Cau hoi can tra loi

1. Product identity: Platform hay Product? (anh huong toan bo architecture)
2. Target customer cu the: loai farm nao? cay gi? o dau?
3. Pricing model: subscription monthly? per-device? per-farm?
4. Hardware: team ban hardware kem hay chi software?
5. MVP scope: feature toi thieu nao de co khach dau tien?
6. Roadmap: bo gi, giu gi, them gi?

---

**Next step:** Tra loi cac cau hoi o Section 11, sau do tao implementation plan cu the.
