# Phase 02 — Gateway Entity + Provision Flow

## Overview

- **Priority:** P1
- **Status:** complete
- **Effort:** 3h

Tạo `GatewayModule` với entity, provision flow qua MQTT (giống device), và REST endpoint để app pair gateway với farm.

## Key Insights

- Gateway provision dùng MQTT anonymous (giống `provision/new` của device) — không cần HTTP riêng
- App pair gateway bằng `pairingToken` qua REST endpoint mới
- Server publish `mqttToken` về gateway qua `provision/gateway/resp/{nonce}` sau khi paired
- Gateway lưu `{gatewayId, mqttToken}` vào NVS → reconnect MQTT với credentials
- `farmId` được set lúc app pair (không phải lúc gateway self-provision)

## Provision Flow

```
Gateway (MQTT anonymous) → provision/gateway/new {serial, hw, nonce}
  Server: tạo Gateway(PENDING) + pairingToken → publish provision/gateway/resp/{nonce} {pairingToken}

App → POST /provision/gateway/pair {pairingToken, farmId}
  Server: Gateway status=PAIRED, farmId set, sinh mqttToken
  Server: publish provision/gateway/resp/{nonce} {gatewayId, mqttToken}

Gateway nhận → lưu NVS → reconnect MQTT với {gateway:{gwId}, mqttToken}
```

## Related Files

**Create:**
- `src/gateway/gateway.module.ts`
- `src/gateway/gateway.service.ts`
- `src/gateway/gateway.controller.ts`
- `src/gateway/entities/gateway.entity.ts`
- `src/gateway/dto/pair-gateway.dto.ts`

**Modify:**
- `src/device/mqtt/mqtt.service.ts` — subscribe `provision/gateway/new`, `provision/gateway/resp/+`
- `src/app.module.ts` — import GatewayModule

## Data Model

```typescript
// gateway.entity.ts
@Entity()
export class Gateway {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100, unique: true })
  serial: string;

  @Column({ length: 50, nullable: true })
  hardwareVersion: string;

  @Column({ length: 20, nullable: true })
  firmwareVersion: string;

  @Column({ type: 'varchar', nullable: true })
  mqttToken: string;

  @Column({ type: 'enum', enum: GatewayStatus, default: GatewayStatus.PENDING })
  status: GatewayStatus;

  @Column('uuid', { nullable: true })
  farmId: string;

  @ManyToOne(() => Farm, { nullable: true })
  @JoinColumn({ name: 'farmId' })
  farm: Farm;

  @Column({ type: 'timestamp', nullable: true })
  lastSeenAt: Date;          // heartbeat tracking

  @Column({ nullable: true })
  provisionedAt: Date;

  @Column({ nullable: true })
  pairedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export enum GatewayStatus {
  PENDING  = 'pending',
  PAIRED   = 'paired',
  ACTIVE   = 'active',
  DISABLED = 'disabled',
}
```

## Implementation Steps

### 1. Tạo Gateway entity

File: `src/gateway/entities/gateway.entity.ts` — theo data model trên.

### 2. Tạo GatewayService

File: `src/gateway/gateway.service.ts`

Methods:
```typescript
// Gọi khi nhận MQTT provision/gateway/new
async handleProvisionRequest(payload: { serial, hw, nonce }): Promise<void>
  // Tạo/update Gateway(PENDING)
  // Generate pairingToken (random 32 bytes hex, 24h expiry)
  // Publish provision/gateway/resp/{nonce} { pairingToken }

// Gọi từ REST endpoint — app pair
async pairGateway(dto: PairGatewayDto): Promise<{ gatewayId, mqttToken }>
  // Verify pairingToken (chưa dùng, chưa hết hạn)
  // Set farmId, status=PAIRED, generate mqttToken
  // Publish provision/gateway/resp/{nonce} { gatewayId, mqttToken }
  // Cần lưu nonce trong Gateway entity (hoặc separate PairingToken entity)

// CRUD cho admin
async findByFarm(farmId: string): Promise<Gateway[]>
async findOne(id: string): Promise<Gateway>
```

> **Lưu ý:** Cần lưu `nonce` để publish response sau khi pair. Thêm `@Column nonce: string` vào entity hoặc dùng separate table như PairingToken của device.
> Đơn giản nhất: thêm `nonce` + `pairingToken` + `pairingTokenExpiresAt` + `pairingTokenUsed` vào Gateway entity (tránh tạo bảng mới).

### 3. Tạo GatewayController

File: `src/gateway/gateway.controller.ts`

```typescript
POST /provision/gateway/pair   // app pair gateway với farm
  Body: { pairingToken: string, farmId: string }
  Guard: JwtAuthGuard

GET  /gateways                 // list gateways (admin/user)
  Guard: JwtAuthGuard

GET  /gateways/:id             // detail
  Guard: JwtAuthGuard
```

### 4. Subscribe MQTT topics trong MqttService

File: `src/device/mqtt/mqtt.service.ts`

Thêm subscription trong `onModuleInit()` (sau khi GatewayService được inject hoặc dùng EventEmitter):
```typescript
// Dùng EventEmitter để tránh circular dependency
this.onMessage('provision/gateway/new', (msg) => {
  this.eventEmitter.emit('gateway.provision.requested', msg.payload);
});
```

GatewayService lắng nghe:
```typescript
@OnEvent('gateway.provision.requested')
async handleProvisionRequest(payload) { ... }
```

### 5. Tạo GatewayModule

```typescript
@Module({
  imports: [TypeOrmModule.forFeature([Gateway]), DeviceModule],
  controllers: [GatewayController],
  providers: [GatewayService],
  exports: [GatewayService],
})
export class GatewayModule {}
```

### 6. Import vào AppModule

`src/app.module.ts` — thêm `GatewayModule` vào `imports`.

## DTO

```typescript
// pair-gateway.dto.ts
export class PairGatewayDto {
  @IsString() @IsNotEmpty()
  pairingToken: string;

  @IsUUID()
  farmId: string;
}
```

## Todo

- [x] Tạo `gateway.entity.ts` với GatewayStatus enum
- [x] Tạo `gateway.service.ts` với `handleProvisionRequest()` + `pairGateway()`
- [x] Tạo `gateway.controller.ts` — pair + list endpoints
- [x] Tạo `pair-gateway.dto.ts`
- [x] Tạo `gateway.module.ts`
- [x] MqttService subscribe `provision/gateway/new` → emit event
- [x] GatewayService `@OnEvent('gateway.provision.requested')`
- [x] Import GatewayModule vào AppModule
- [x] Compile check: `yarn build`

## Success Criteria

- Gateway publish `provision/gateway/new` → server tạo Gateway record + publish `pairingToken`
- App POST `/provision/gateway/pair` → Gateway status=PAIRED + server publish `{gatewayId, mqttToken}`
- `GET /gateways` trả list gateways của user's farms

## Risk

- Circular dependency MqttService ↔ GatewayService → dùng EventEmitter để tách
- `nonce` cần được lưu để publish response sau khi pair (async flow) — lưu vào entity
