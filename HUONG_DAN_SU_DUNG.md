# Hướng Dẫn Sử Dụng IoT Platform với EMQX

## 📋 Mục Lục

1. [Cài Đặt và Khởi Động](#cài-đặt-và-khởi-động)
2. [Cấu Hình EMQX](#cấu-hình-emqx)
3. [Quy Trình Provisioning và Pairing](#quy-trình-provisioning-và-pairing)
4. [API Endpoints](#api-endpoints)
5. [MQTT Topics](#mqtt-topics)
6. [Ví Dụ Sử Dụng](#ví-dụ-sử-dụng)
7. [Testing](#testing)

---

## 🚀 Cài Đặt và Khởi Động

### Yêu Cầu Hệ Thống

- Docker và Docker Compose
- Node.js 18+ (nếu chạy local)
- Yarn hoặc npm

### Bước 1: Clone và Cài Đặt

```bash
# Clone repository
git clone <repository-url>
cd nest-websockets-chat-boilerplate

# Cài đặt dependencies
yarn install
```

### Bước 2: Cấu Hình Environment

Tạo file `.env` từ `.env.example`:

```bash
cp .env.example .env
```

Chỉnh sửa các giá trị trong `.env`:

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_NAME=postgres
DB_PASS=pass123

# JWT
JWT_ACCESS_SECRET=your-secret-key-here
JWT_REFRESH_SECRET=your-refresh-secret-here
JWT_ACCESS_EXPIRE=60m
JWT_REFRESH_EXPIRE=30d

# MQTT
MQTT_BROKER_URL=mqtt://localhost:1883
```

### Bước 3: Khởi Động Services

```bash
# Khởi động tất cả services (PostgreSQL, EMQX, NestJS)
docker-compose up -d

# Hoặc chạy development mode
yarn start:dev
```

### Bước 4: Kiểm Tra Services

- **NestJS API**: http://localhost:3000
- **EMQX Dashboard**: http://localhost:18083
  - Username: `admin`
  - Password: `public`
- **PostgreSQL**: localhost:5433

---

## ⚙️ Cấu Hình EMQX

### Truy Cập Dashboard

1. Mở trình duyệt: http://localhost:18083
2. Đăng nhập với:
   - Username: `admin`
   - Password: `public`

### Cấu Hình HTTP Hooks (Auth/ACL)

EMQX sẽ tự động gọi các endpoints sau khi được cấu hình:

- **Authentication Hook**: `POST http://localhost:3000/emqx/auth`
- **ACL Hook**: `POST http://localhost:3000/emqx/acl`

Các hooks này đã được tự động cấu hình trong code. Không cần cấu hình thêm trong EMQX Dashboard.

### Thay Đổi Password Dashboard

1. Vào Dashboard → Settings → Users
2. Chọn user `admin`
3. Click "Change Password"
4. Cập nhật password mới trong `docker-compose.yml`:
   ```yaml
   - EMQX_DASHBOARD__DEFAULT_PASSWORD=your-new-password
   ```

---

## 🔄 Quy Trình Provisioning và Pairing

### Tổng Quan Flow

```
1. Device Power On
   ↓
2. Device publish → provision/new {serial, hw}
   ↓
3. Server tạo pairing token
   ↓
4. Server publish → device/{deviceId}/provision/resp
   ↓
5. User nhập serial trên Mobile App
   ↓
6. Mobile App gọi POST /api/provision/pair
   ↓
7. Server gán device token và link device → farm
   ↓
8. Server publish → farm/{farmId}/device/{deviceId}/cmd {set_owner}
   ↓
9. Device nhận token và chuyển sang normal operation
```

### Bước 1: Device Provisioning

Device gửi provisioning request:

```javascript
// Device code (ví dụ)
const mqtt = require('mqtt');
const client = mqtt.connect('mqtt://localhost:1883');

client.on('connect', () => {
  // Publish provisioning request
  client.publish('provision/new', JSON.stringify({
    serial: 'SN123456789',
    hw: 'v1.0'
  }));
  
  // Subscribe để nhận response
  client.subscribe('device/+/provision/resp');
});

client.on('message', (topic, message) => {
  const data = JSON.parse(message.toString());
  console.log('Pairing token:', data.token);
});
```

### Bước 2: Pairing Device với Farm

**Từ Mobile App hoặc API Client:**

```bash
# 1. Đăng nhập để lấy JWT token
curl -X POST http://localhost:3000/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{
    "username": "user1",
    "password": "password123"
  }'

# Response:
# {
#   "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
#   "user": { "id": "uuid", "username": "user1" }
# }

# 2. Pair device với farm
curl -X POST http://localhost:3000/api/provision/pair \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "serial": "SN123456789",
    "farmId": "farm-uuid-here"
  }'

# Response:
# {
#   "deviceId": "device-uuid",
#   "serial": "SN123456789",
#   "deviceToken": "abc123...",
#   "status": "paired"
# }
```

### Bước 3: Device Nhận Token

Device sẽ nhận command `set_owner` qua topic:

```
farm/{farmId}/device/{deviceId}/cmd
```

Payload:
```json
{
  "cmd": "set_owner",
  "ownerId": "user-uuid",
  "token": "device-token-here",
  "timestamp": "2026-01-24T01:00:00.000Z"
}
```

Device lưu token và sử dụng để authenticate cho các lần kết nối sau.

---

## 📡 API Endpoints

### Authentication

#### Đăng Ký
```http
POST /api/auth/signup
Content-Type: application/json

{
  "username": "user1",
  "password": "password123"
}
```

#### Đăng Nhập
```http
POST /api/auth/signin
Content-Type: application/json

{
  "username": "user1",
  "password": "password123"
}
```

### Provisioning

#### Lấy Trạng Thái Pairing
```http
GET /api/provision/status/{serial}
```

#### Pair Device
```http
POST /api/provision/pair
Authorization: Bearer {token}
Content-Type: application/json

{
  "serial": "SN123456789",
  "farmId": "farm-uuid"
}
```

#### Unpair Device
```http
POST /api/provision/{deviceId}/unpair
Authorization: Bearer {token}
```

#### Regenerate Device Token
```http
POST /api/provision/{deviceId}/regenerate-token
Authorization: Bearer {token}
```

### Devices

#### Danh Sách Devices
```http
GET /api/device?farmId={farmId}
Authorization: Bearer {token}
```

#### Chi Tiết Device
```http
GET /api/device/{deviceId}
Authorization: Bearer {token}
```

#### Tạo Device (Manual)
```http
POST /api/device
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "Device 1",
  "imei": "IMEI123456",
  "serial": "SN123456789",
  "hardwareVersion": "v1.0",
  "farmId": "farm-uuid"
}
```

#### Gửi Command đến Device
```http
POST /api/device/{deviceId}/command
Authorization: Bearer {token}
Content-Type: application/json

{
  "command": "reboot",
  "params": {
    "delay": 5
  }
}
```

#### Trạng Thái Device
```http
GET /api/device/{deviceId}/status
Authorization: Bearer {token}
```

---

## 📨 MQTT Topics

### Topic Convention

| Topic Pattern | Direction | Mô Tả |
|--------------|-----------|-------|
| `provision/new` | Device → Server | Device gửi provisioning request |
| `device/{deviceId}/provision/resp` | Server → Device | Server trả về pairing token |
| `device/{deviceId}/status` | Device → Server | Device báo cáo trạng thái (retained) |
| `device/{deviceId}/telemetry` | Device → Server | Dữ liệu cảm biến |
| `farm/{farmId}/device/{deviceId}/cmd` | Server → Device | Lệnh từ server/app |
| `farm/{farmId}/device/{deviceId}/resp` | Device → Server | Phản hồi từ device |
| `user/{userId}/notifications` | Server → Mobile | Thông báo cho user |

### Ví Dụ Publish/Subscribe

#### Device Publish Status
```javascript
client.publish('device/DEVICE123/status', JSON.stringify({
  status: 'online',
  battery: 85,
  temperature: 25.5,
  timestamp: new Date().toISOString()
}), { qos: 1, retain: true });
```

#### Device Publish Telemetry
```javascript
client.publish('device/DEVICE123/telemetry', JSON.stringify({
  temperature: 25.5,
  humidity: 60,
  pressure: 1013.25,
  timestamp: new Date().toISOString()
}), { qos: 1 });
```

#### Device Subscribe Commands
```javascript
client.subscribe('farm/FARM123/device/DEVICE123/cmd', (err) => {
  if (!err) {
    console.log('Subscribed to commands');
  }
});

client.on('message', (topic, message) => {
  const cmd = JSON.parse(message.toString());
  console.log('Received command:', cmd);
  
  // Xử lý command
  if (cmd.cmd === 'reboot') {
    // Reboot device
  }
});
```

---

## 💡 Ví Dụ Sử Dụng

### Ví Dụ 1: Simulate Device Provisioning

Sử dụng file `test-mqtt-device.js`:

```bash
# Chạy device simulator
node test-mqtt-device.js SN123456789

# Device sẽ tự động:
# 1. Connect to MQTT broker
# 2. Publish provisioning request
# 3. Subscribe và nhận pairing token
```

### Ví Dụ 2: Complete Flow với cURL

```bash
# 1. Đăng nhập
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"username":"user1","password":"pass123"}' \
  | jq -r '.accessToken')

# 2. Tạo farm (nếu chưa có)
FARM_ID=$(curl -s -X POST http://localhost:3000/api/farm \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Farm"}' \
  | jq -r '.id')

# 3. Pair device
curl -X POST http://localhost:3000/api/provision/pair \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"serial\":\"SN123456789\",\"farmId\":\"$FARM_ID\"}"

# 4. Gửi command đến device
curl -X POST http://localhost:3000/api/device/{deviceId}/command \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"command":"get_status","params":{}}'
```

### Ví Dụ 3: WebSocket Connection (Mobile App)

```javascript
// Kết nối WebSocket
const socket = io('http://localhost:3000/device', {
  auth: {
    token: 'YOUR_JWT_TOKEN'
  }
});

// Subscribe to device updates
socket.emit('subscribeToDevice', { deviceId: 'device-uuid' });

// Nhận device data
socket.on('deviceData', (data) => {
  console.log('Device data:', data);
});

// Nhận device status
socket.on('deviceStatus', (status) => {
  console.log('Device status:', status);
});

// Gửi command
socket.emit('sendCommand', {
  deviceId: 'device-uuid',
  command: 'reboot',
  params: { delay: 5 }
});
```

---

## 🧪 Testing

### Test MQTT Connection

```bash
# Sử dụng mosquitto client
mosquitto_pub -h localhost -p 1883 -t "test/topic" -m "Hello MQTT"
mosquitto_sub -h localhost -p 1883 -t "test/topic"
```

### Test Device Simulator

```bash
# Chạy device simulator
node test-mqtt-device.js TEST001

# Device sẽ:
# - Connect và publish status mỗi 10 giây
# - Subscribe commands
# - Respond to commands
```

### Test API với Swagger

1. Khởi động server: `yarn start:dev`
2. Truy cập: http://localhost:3000/api (Swagger UI)
3. Test các endpoints trực tiếp từ browser

### Test EMQX Hooks

```bash
# Test Auth Hook
curl -X POST http://localhost:3000/emqx/auth \
  -H "Content-Type: application/json" \
  -d '{
    "username": "device:DEVICE123",
    "password": "device-token-here"
  }'

# Expected: {"result": "allow"} hoặc {"result": "deny"}

# Test ACL Hook
curl -X POST http://localhost:3000/emqx/acl \
  -H "Content-Type: application/json" \
  -d '{
    "username": "device:DEVICE123",
    "topic": "device/DEVICE123/status",
    "access": 2
  }'

# Expected: {"result": "allow"} hoặc {"result": "deny"}
```

---

## 🔒 Bảo Mật

### Device Authentication

- Device sử dụng **static token** được generate khi pairing
- Token được lưu trong database và device
- Token có thể regenerate nếu bị lộ

### User Authentication

- User sử dụng **JWT tokens**
- Access token: 60 phút
- Refresh token: 30 ngày

### ACL (Access Control List)

- Device chỉ có thể publish/subscribe vào topics của chính nó
- User chỉ có thể access devices trong farms của họ
- Server validate ownership trước khi cho phép

---

## 🐛 Troubleshooting

### EMQX không khởi động

```bash
# Kiểm tra logs
docker-compose logs emqx

# Kiểm tra ports
netstat -tulpn | grep 1883
```

### Device không connect được

1. Kiểm tra device token đúng chưa
2. Kiểm tra EMQX đang chạy: `docker ps`
3. Kiểm tra network: `docker network ls`

### API trả về 401 Unauthorized

- Kiểm tra JWT token còn hạn không
- Kiểm tra token format: `Bearer {token}`
- Kiểm tra JWT secret trong `.env`

### MQTT messages không đến

1. Kiểm tra device đã subscribe đúng topic chưa
2. Kiểm tra ACL cho phép publish/subscribe không
3. Xem logs trong EMQX Dashboard → Monitoring

---

## 📚 Tài Liệu Tham Khảo

- [EMQX Documentation](https://www.emqx.io/docs)
- [NestJS Documentation](https://docs.nestjs.com)
- [MQTT Protocol](https://mqtt.org)
- [TypeORM Documentation](https://typeorm.io)

---

## 💬 Hỗ Trợ

Nếu gặp vấn đề, vui lòng:
1. Kiểm tra logs: `docker-compose logs`
2. Xem EMQX Dashboard: http://localhost:18083
3. Kiểm tra API docs: http://localhost:3000/api

---

**Chúc bạn sử dụng thành công! 🚀**
