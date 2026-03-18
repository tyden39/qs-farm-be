# Code Standards & Architecture Patterns

## File Naming Conventions

### TypeScript/JavaScript Files
- **Format:** lowercase with hyphens (kebab-case)
- **Pattern:** `{feature}.{type}.ts`
- **Examples:**
  - `mqtt.service.ts` (service)
  - `jwt-auth.guard.ts` (guard)
  - `device.controller.ts` (controller)
  - `sensor.entity.ts` (entity)
  - `create-user.dto.ts` (data transfer object)
  - `is-unique.validator.ts` (custom validator)
  - `device.gateway.ts` (WebSocket gateway)

### Directory Structure
- **Modules:** Feature-based in `src/{feature}/`
- **Subdirectories:**
  - `entities/` - TypeORM entities
  - `dtos/` - Data Transfer Objects
  - `services/` - Business logic services
  - `controllers/` - HTTP route handlers
  - `gateway/` - WebSocket gateways
  - `guards/` - Authentication guards
  - `strategies/` - Passport strategies
  - `decorators/` - Custom decorators
  - `interfaces/` - TypeScript interfaces
  - `enums/` - Enum definitions

## Class & Function Naming

### Classes
- **Format:** PascalCase
- **Examples:**
  - `UserService`
  - `DeviceController`
  - `JwtAuthGuard`
  - `SensorThreshold`
  - `MqttService`
  - `DeviceGateway`

### Methods & Functions
- **Format:** camelCase
- **Verb-based:** `getUser()`, `createFarm()`, `updateDevice()`, `deleteSchedule()`
- **Boolean methods:** `isActive()`, `hasPermission()`, `canAccess()`
- **Handlers:** `handleProvisionRequest()`, `processTelemetry()`

### Constants
- **Format:** UPPER_SNAKE_CASE for file-level constants
- **Example:** `DEFAULT_PAGE_LIMIT = 10`, `MAX_FILE_SIZE_MB = 5`

### Variables & Properties
- **Format:** camelCase
- **Examples:** `deviceId`, `sensorType`, `farmName`, `isEnabled`

### Enums
- **Format:** PascalCase for enum name, UPPER_SNAKE_CASE for values
- **Example:**
  ```typescript
  enum DeviceStatus {
    PENDING = 'PENDING',
    PAIRED = 'PAIRED',
    ACTIVE = 'ACTIVE',
    DISABLED = 'DISABLED'
  }
  ```

## Code Formatting

### Prettier Configuration
File: `.prettierrc`
```json
{
  "singleQuote": true,
  "trailingComma": "all"
}
```

**Formatting rules:**
- Single quotes for strings (not double quotes)
- Trailing commas in multi-line objects, arrays, parameters
- 2-space indentation
- 80-character line length preference (not enforced)

**Running Prettier:**
```bash
yarn format    # Format all files
```

### ESLint Configuration
File: `.eslintrc.js`

**Active rules:**
- `@typescript-eslint/no-explicit-any` - Warn (prefer explicit types)
- `@typescript-eslint/explicit-module-boundary-types` - Warn
- Standard NestJS recommended rules
- Prettier integration for formatting

**Philosophy:** Relaxed rules focused on code quality over strict formatting. Prioritize readability and maintainability.

**Running ESLint:**
```bash
yarn lint      # Check and auto-fix style issues
```

## TypeScript Style Guide

### Type Annotations
- **Explicit types:** Always annotate function parameters and return types
```typescript
// Good
async getUser(id: string): Promise<User> {
  return this.userRepository.findOne(id);
}

// Avoid
async getUser(id) {
  return this.userRepository.findOne(id);
}
```

### Imports
- **Order:** Standard library → Third-party → Local
- **Format:** Absolute paths from `src/` root
```typescript
import { Injectable } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserService } from 'src/user/user.service';
```

### Null/Undefined Handling
- **Prefer:** Explicit null checks or optional chaining
```typescript
// Good
const name = user?.name ?? 'Unknown';

// Good
if (user) {
  return user.email;
}
```

### Arrow Functions
- Prefer arrow functions in callbacks and event handlers
```typescript
// Good
this.eventEmitter.on('telemetry.received', (data) => {
  this.processTelemetry(data);
});

// Also acceptable
numbers.map((n) => n * 2);
```

## NestJS Architectural Patterns

### Module Organization
- **One feature per module** (e.g., UserModule, DeviceModule)
- **Explicit exports** of public services and controllers
- **Dependency injection** via constructor parameters
```typescript
@Module({
  imports: [UserModule, JwtModule],
  controllers: [FarmController],
  providers: [FarmService],
  exports: [FarmService],
})
export class FarmModule {}
```

### Service Layer
- **Single responsibility:** Each service handles one domain
- **Method organization:** Grouped by functionality (CRUD, business logic, utilities)
- **Error handling:** Use try-catch for external operations (MQTT, API calls)
```typescript
@Injectable()
export class DeviceService {
  constructor(private deviceRepository: Repository<Device>) {}

  // CRUD Methods
  async create(dto: CreateDeviceDto): Promise<Device> {
    // Implementation
  }

  // Business Logic
  async updateDeviceStatus(deviceId: string, status: DeviceStatus) {
    // Implementation
  }

  // Utilities
  private validateDeviceToken(token: string): boolean {
    // Implementation
  }
}
```

### Controller Layer
- **Route validation:** Use DTOs with class-validator decorators
- **Response formatting:** Return plain objects (NestJS handles serialization)
- **Guard usage:** Apply @UseGuards for authentication
```typescript
@Controller('device')
@UseGuards(JwtAuthGuard)
export class DeviceController {
  constructor(private deviceService: DeviceService) {}

  @Post()
  async create(@Body() dto: CreateDeviceDto): Promise<DeviceDto> {
    return this.deviceService.create(dto);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<DeviceDto> {
    return this.deviceService.findOne(id);
  }
}
```

### Data Transfer Objects (DTOs)
- **Class-validator decorators:** All public input DTOs must validate
- **Naming:** `Create{Entity}Dto`, `Update{Entity}Dto`, `{Entity}Dto`
- **Minimal required fields:** Only include necessary properties
```typescript
export class CreateDeviceDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsUnique({ table: 'device', column: 'imei' })
  imei: string;

  @IsEnum(DeviceStatus)
  status?: DeviceStatus;
}
```

### Entity Design
- **UUID primary keys** (except SensorData which uses bigint)
- **Timestamps:** `createdAt`, `updatedAt` auto-managed by TypeORM
- **Relationships:** Explicit OneToMany, ManyToOne with cascade options
- **Unique constraints:** For business-critical fields (email, serial, IMEI)
```typescript
@Entity('device')
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 50, unique: true })
  imei: string;

  @Column({ type: 'enum', enum: DeviceStatus })
  status: DeviceStatus;

  @ManyToOne(() => Farm, (farm) => farm.devices)
  farm: Farm;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### Guard & Strategy Pattern
- **JwtAuthGuard** (`src/auth/guards/jwt-auth.guard.ts`): Validate Bearer token on protected routes
- **LocalAuthGuard** (`src/auth/guards/local-auth.guard.ts`): Validate username/password at login
- **JwtStrategy** (`src/auth/strategies/jwt.strategy.ts`): Extract and validate JWT payload
```typescript
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

@UseGuards(JwtAuthGuard)
@Get('protected-route')
async protectedEndpoint(@CurrentUser() user: User) {
  // Only authenticated users can access
}
```

### Validation Pipe
- **Global AutoValidationPipe:** Applied in `main.ts`
- **Options:** `whitelist: true`, `transform: true`, `forbidNonWhitelisted: false`
- **Status code:** 422 for validation errors
```typescript
// main.ts
app.useGlobalPipes(new AutoValidationPipe());

// Strips unknown fields and transforms types
const dto = new CreateUserDto();
// { email: 'test@example.com' } → typed UserDto instance
```

### Event-Driven Architecture
- **Event Emitter:** `@nestjs/event-emitter` for decoupled communication
- **Event types:** Defined in service emitting events
- **Listeners:** Use `@OnEvent` decorator in subscriber services
```typescript
// In DeviceService (emitter)
this.eventEmitter.emit('telemetry.received', {
  deviceId: device.id,
  readings: data,
});

// In SensorService (listener)
@OnEvent('telemetry.received')
async processTelemetry(payload: any) {
  // Handle event
}
```

### WebSocket (Socket.IO) Pattern
- **Gateway:** `DeviceGateway` handles Socket.IO namespace `/device`
- **Authentication:** JWT validation on handshake
- **Rooms:** `device:{deviceId}` for targeted broadcasts
- **Events:** Server emits `deviceData`, `deviceAlert`, etc.
```typescript
@WebSocketGateway({
  namespace: '/device',
  cors: { origin: '*' },
})
export class DeviceGateway implements OnGatewayConnection {
  @SubscribeMessage('subscribeToDevice')
  handleSubscribe(client: Socket, payload: { deviceId: string }) {
    client.join(`device:${payload.deviceId}`);
  }

  broadcastDeviceData(deviceId: string, data: any) {
    this.server.to(`device:${deviceId}`).emit('deviceData', data);
  }
}
```

### MQTT Service Pattern
- **Single connection:** MqttService maintains one broker connection
- **Subscribe-Publish:** Supports wildcard patterns
- **Event emission:** Publishes domain events for processing
```typescript
@Injectable()
export class MqttService {
  private client: mqtt.MqttClient;

  async publish(topic: string, message: any): Promise<void> {
    this.client.publish(topic, JSON.stringify(message));
  }

  subscribe(topic: string, callback: (msg: any) => void): void {
    this.client.subscribe(topic);
    this.client.on('message', (receivedTopic, buffer) => {
      if (this.matchesTopic(receivedTopic, topic)) {
        callback(JSON.parse(buffer.toString()));
      }
    });
  }
}
```

## Database Patterns

### TypeORM Configuration
- **Synchronize:** `synchronize: true` (auto-sync schema from entities)
- **Auto-load entities:** `autoLoadEntities: true` (auto-discover from modules)
- **Connection:** PostgreSQL 14+
```typescript
// In config/database.config.ts
TypeOrmModule.forRoot({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASS,
  synchronize: true,
  autoLoadEntities: true,
})
```

### Repository Pattern
- **Injected repositories:** Via `TypeOrmModule.forFeature([Entity])`
- **Query methods:** Use Repository methods (`find`, `findOne`, `save`, `remove`)
- **Custom queries:** Create custom repository methods for complex queries
```typescript
@Injectable()
export class SensorService {
  constructor(
    @InjectRepository(SensorData)
    private sensorDataRepository: Repository<SensorData>,
  ) {}

  async getStats(deviceId: string, sensorType: string) {
    return this.sensorDataRepository
      .createQueryBuilder('sd')
      .select('MIN(sd.value)', 'min')
      .addSelect('MAX(sd.value)', 'max')
      .addSelect('AVG(sd.value)', 'avg')
      .where('sd.deviceId = :deviceId', { deviceId })
      .andWhere('sd.sensorType = :sensorType', { sensorType })
      .getRawOne();
  }
}
```

### Time-Series Data Optimization
- **Bigint primary key** for SensorData (supports 1B+ rows)
- **Indexed columns:** (deviceId, createdAt), (deviceId, sensorType, createdAt)
- **Aggregation:** Use PostgreSQL `DATE_TRUNC` for bucketing
```typescript
@Entity('sensor_data')
export class SensorData {
  @PrimaryGeneratedColumn('increment')
  id: bigint;

  @Column()
  deviceId: string;

  @Column({ type: 'enum', enum: SensorType })
  sensorType: SensorType;

  @Column({ type: 'double' })
  value: number;

  @CreateDateColumn()
  @Index()
  createdAt: Date;
}
```

## Error Handling

### HTTP Exceptions
- **BadRequestException:** Validation or logic errors (400)
- **UnauthorizedException:** Missing or invalid auth (401)
- **ForbiddenException:** Insufficient permissions (403)
- **NotFoundException:** Resource not found (404)
- **InternalServerErrorException:** Unexpected errors (500)

```typescript
if (!user) {
  throw new NotFoundException('User not found');
}

if (device.farmId !== currentUser.farmId) {
  throw new ForbiddenException('Access denied to this device');
}

if (password.length < 8) {
  throw new BadRequestException('Password too short');
}
```

### MQTT Error Handling
- **Try-catch for publish:** Handle broker unavailability
- **Reconnection:** Automatic retry with exponential backoff
- **Logging:** Log MQTT errors for debugging
```typescript
async publish(topic: string, message: any): Promise<void> {
  try {
    return new Promise((resolve, reject) => {
      this.client.publish(topic, JSON.stringify(message), (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  } catch (error) {
    this.logger.error(`MQTT publish failed: ${error.message}`);
    throw new InternalServerErrorException('Failed to send command');
  }
}
```

## Security Patterns

### Authentication
- **JWT Strategy:** Validate token on every protected request
- **Token Version:** Increment on password change for revocation
- **Refresh Token:** HTTP-only cookie with 30-day expiry
- **Access Token:** Bearer header with 60-minute expiry

```typescript
@Post('change-password')
@UseGuards(JwtAuthGuard)
async changePassword(
  @CurrentUser() user: User,
  @Body() dto: ChangePasswordDto,
): Promise<void> {
  // Validate old password
  const valid = await bcrypt.compare(dto.oldPassword, user.password);
  if (!valid) throw new UnauthorizedException('Invalid password');

  // Hash new password
  const hashed = await bcrypt.hash(dto.newPassword, 7);

  // Update and increment token version
  user.password = hashed;
  user.tokenVersion += 1;
  await this.userRepository.save(user);
}
```

### Farm Scoping
- **Query filtering:** Always filter by user's farm
- **Enforce in service:** Don't rely on client-side validation
```typescript
async getDevices(currentUser: User): Promise<Device[]> {
  return this.deviceRepository.find({
    where: { farm: { id: currentUser.farmId } },
  });
}
```

### Input Validation
- **DTO validation:** class-validator decorators on all public DTOs
- **Whitelist:** Global pipe strips unknown properties
- **Type coercion:** Automatic string-to-number, etc.

## Testing Patterns

### Unit Test Structure
- **One test file per service:** `{feature}.service.spec.ts`
- **Mock dependencies:** Use jest.mock() or mock providers
- **Test organization:** Group by method with describe blocks

```typescript
describe('UserService', () => {
  let service: UserService;
  let repository: Repository<User>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(UserService);
    repository = module.get(getRepositoryToken(User));
  });

  describe('getUser', () => {
    it('should return a user by ID', async () => {
      const user = { id: '1', name: 'John' };
      jest.spyOn(repository, 'findOne').mockResolvedValue(user);

      const result = await service.getUser('1');
      expect(result).toEqual(user);
    });
  });
});
```

## Documentation in Code

### Comment Philosophy
- **Minimal comments:** Code should be self-documenting
- **Complex logic only:** Explain "why", not "what"
- **No JSDoc on simple methods:** Only on complex/public APIs

```typescript
// Good: Explains decision
private calculateCooldown(level: AlertLevel): number {
  // CRITICAL alerts have 60s cooldown to prevent spam,
  // WARNING alerts have 30s for faster user feedback
  return level === AlertLevel.CRITICAL ? 60000 : 30000;
}

// Avoid: Obvious from code
// Increment the counter
counter++;

// Avoid: Outdated documentation
// This returns the user
// (Actually returns devices in current implementation)
getDevices(): Device[] { ... }
```

### Type Documentation
- **Complex DTOs:** Add JSDoc for clarity
- **Interfaces:** Document purpose and usage
```typescript
/**
 * Request payload for device command execution.
 *
 * @example
 * { deviceId: 'abc-123', command: 'PUMP_ON', params: { speed: 100 } }
 */
export interface DeviceCommand {
  deviceId: string;
  command: string;
  params?: Record<string, any>;
}
```

## Performance Optimization

### Database Query Optimization
- **Select specific columns:** Avoid SELECT *
- **Eager load relations:** Use `.leftJoinAndSelect` when needed
- **Index critical paths:** (deviceId, createdAt), (farmId)
- **Pagination:** Always apply limit/offset

```typescript
// Good: Specific columns and pagination
this.deviceRepository
  .createQueryBuilder('d')
  .select(['d.id', 'd.name', 'd.status'])
  .where('d.farmId = :farmId', { farmId })
  .skip(0)
  .take(10)
  .getMany();
```

### Caching
- **Sensor config:** 60-second TTL in-memory cache
- **Device status:** Cached per-service, invalidated on change
- **JWT validation:** Performed on every request (no caching)

### Pagination
- **Default limit:** 10 items
- **Max limit:** 100 items
- **Offset/limit pattern:** Industry standard
```typescript
// Helper function in utils
export function infinityPagination<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
) {
  return {
    data,
    total,
    page,
    limit,
    hasMore: page * limit < total,
  };
}
```

## Advanced Patterns (v1.4+)

### Excel Export Pattern (Pump Module)
- **Library:** ExcelJS for workbook generation
- **Template format:** Define headers, styles, column widths
- **Data export:** Stream data to client with proper MIME type
```typescript
@Get('report/:deviceId')
async generatePumpReport(
  @Param('deviceId') deviceId: string,
  @Query() query: PumpReportQueryDto,
  @Res() res: Response,
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Pump Report');

  // Define headers with styling
  worksheet.columns = [
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Duration (s)', key: 'duration', width: 15 },
  ];

  // Add data rows
  const sessions = await this.pumpService.getSessions(deviceId, query);
  worksheet.addRows(sessions);

  // Stream to client
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=pump-report.xlsx');
  await workbook.xlsx.write(res);
  res.end();
}
```

### Puppeteer Scraping Pattern (Coffee Price)
- **Headless browser:** Launch with specific args for Cloudflare handling
- **Retry logic:** 3 attempts with exponential delays (0s, 30s, 60s)
- **Error recovery:** Timeout handling and graceful degradation
```typescript
@Injectable()
export class CoffeePriceService {
  async scrapeGiacaphe(): Promise<CoffeePrice[]> {
    let browser: Browser;
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        const page = await browser.newPage();
        await page.goto(GIACAPHE_URL, { waitUntil: 'networkidle2', timeout: 30000 });

        const data = await page.evaluate(() => {
          // Extract price data using Cheerio-style selectors
          return document.querySelectorAll('.price-row').map(row => ({
            market: row.querySelector('.market').textContent,
            price: parseFloat(row.querySelector('.price').textContent),
          }));
        });

        return data;
      } catch (error) {
        if (attempt < maxRetries - 1) {
          const delay = attempt === 0 ? 0 : attempt * 30000;
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw error;
        }
      } finally {
        if (browser) await browser.close();
      }
    }
  }
}
```

### Firebase Cloud Messaging Pattern (Notifications)
- **Token management:** Register/unregister tokens per user/platform (ios/android)
- **Conditional sending:** Skip push if user online (has active WebSocket)
- **Batch operations:** Send to multiple users efficiently
```typescript
@Injectable()
export class FcmService {
  constructor(
    @InjectRepository(DeviceToken)
    private tokenRepository: Repository<DeviceToken>,
  ) {}

  async sendToFarmOwner(
    farmId: string,
    title: string,
    body: string,
    skipIfOnline: boolean = true,
  ): Promise<void> {
    const farm = await this.farmRepository.findOne(farmId);

    // Skip if farm owner has active WebSocket
    if (skipIfOnline && this.deviceGateway.isUserOnline(farm.userId)) {
      return;
    }

    // Get all tokens for this user
    const tokens = await this.tokenRepository.find({ userId: farm.userId });

    const message = {
      notification: { title, body },
      tokens: tokens.map(t => t.token),
    };

    // Batch send
    await this.firebaseAdmin.messaging().sendMulticast(message);
  }
}
```

### Scheduled Task Pattern (Coffee Price v1.3)
- **Timezone support:** Use Intl.DateTimeFormat for timezone conversion
- **Daily execution:** Schedule at specific time (noon Vietnam time)
- **Interval-based processor:** @Interval with 60-second checks
```typescript
@Injectable()
export class CoffeePriceScheduler {
  private lastExecutionDate: string = null;

  @Interval(60_000) // Check every 60 seconds
  async processDailySchedule(): Promise<void> {
    // Get current time in Vietnam timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
    });

    const timeStr = formatter.format(new Date());
    const [hours, minutes] = timeStr.split(':');

    // Execute at 12:00 (noon)
    if (hours === '12' && minutes === '00') {
      const today = new Date().toISOString().split('T')[0];

      // Prevent duplicate execution
      if (this.lastExecutionDate !== today) {
        this.lastExecutionDate = today;
        await this.coffeePriceService.scrapeAndSave();
      }
    }
  }
}
```

## Build & Deployment

### NestJS Build
```bash
yarn build    # Compiles src/ to dist/ with TypeScript
```

### Runtime Environment
- **Node.js 18+**
- **Environment variables:** Loaded from `.env` via ConfigModule
- **No hardcoded secrets:** All secrets from environment

### Docker
- **Multi-stage build:** Separate build and runtime images
- **Health checks:** For all services in docker-compose
- **Logging:** Docker logs accessible via `docker-compose logs`

---

**Document Version:** 1.1
**Last Updated:** 2026-03-18
**Target Audience:** All developers on the project
**Recent Updates:** Added Excel export (Pump), Puppeteer scraping (Coffee Price), FCM integration (Notifications), and scheduled task patterns
