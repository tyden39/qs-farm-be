# 🚀 Quick Start Guide

## Kiến trúc hệ thống

```
┌─────────────┐         MQTT          ┌─────────────┐         WebSocket      ┌─────────────┐
│   Device    │ ◄──────────────────► │   Server    │ ◄────────────────────► │  Mobile App │
│  (IoT/HW)   │   1883                │  (NestJS)   │   3000/device         │             │
└─────────────┘                       └─────────────┘                        └─────────────┘
```

## Bước 1: Cài đặt dependencies

```bash
yarn install
```

## Bước 2: Setup Database & MQTT Broker

```bash
# Start PostgreSQL and Mosquitto MQTT
docker-compose up -d
```

Điều này sẽ khởi động:
- PostgreSQL trên port `5433`
- Mosquitto MQTT trên port `1883`

## Bước 3: Cấu hình Environment

Tạo file `.env`:

```env
# Database
DB_HOST=localhost
DB_PORT=5433
DB_USERNAME=postgres
DB_PASS=pass123
DB_NAME=postgres

# JWT
JWT_ACCESS_SECRET=your-secret-key-here
JWT_ACCESS_EXPIRE=1h
JWT_REFRESH_SECRET=your-refresh-secret-here
JWT_REFRESH_EXPIRE=7d

# MQTT
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=
MQTT_PASSWORD=
```

## Bước 4: Start Server

```bash
yarn start:dev
```

Server sẽ chạy trên: `http://localhost:3000`

## Bước 5: Test hệ thống

### A. Test WebUI

Mở browser: `http://localhost:3000`

1. Đăng ký tài khoản (Sign Up)
2. Đăng nhập
3. Tạo Farm và Device

### B. Test MQTT Device Simulator

Trong terminal mới:

```bash
# Chạy device simulator với ID là TEST001
node test-mqtt-device.js TEST001
```

Bạn sẽ thấy:
```
🔌 Starting MQTT Device Simulator
📱 Device ID: TEST001
🌐 Broker: mqtt://localhost:1883
-----------------------------------

✅ Connected to MQTT broker
📥 Subscribed to: device/TEST001/command
📡 Published status: online (Battery: 100%)

🚀 Device is running. Press Ctrl+C to stop.

📤 Published data: { temperature: '23.5', humidity: '55', pressure: '1013' }
```

### C. Test WebSocket Client

Mở browser: `http://localhost:3000/device-test.html`

1. Click "Login & Connect" để tự động login và kết nối WebSocket
2. Nhập Device ID: `TEST001`
3. Click "Subscribe" để nhận data từ device
4. Gửi command đến device:
   - Command: `turnOn`
   - Click "Send Command"

Bạn sẽ thấy real-time data từ device trong log!

### D. Test bằng API

```bash
# Login
curl -X POST http://localhost:3000/api/auth/signIn \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123"}'

# Lấy token từ response, sau đó:

# Send command đến device
curl -X POST http://localhost:3000/api/device/{device-id}/command \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"command":"turnOn","params":{}}'

# Check device status
curl http://localhost:3000/api/device/{device-id}/status \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Kiểm tra MQTT trực tiếp

### Subscribe tất cả messages:

```bash
# Install mosquitto clients nếu chưa có
# Ubuntu: sudo apt-get install mosquitto-clients
# Mac: brew install mosquitto

# Listen tất cả messages
mosquitto_sub -h localhost -t "#" -v
```

### Publish test message:

```bash
mosquitto_pub -h localhost -t "device/TEST001/data" \
  -m '{"temperature":25,"humidity":60}'
```

### Test command to device:

```bash
mosquitto_pub -h localhost -t "device/TEST001/command" \
  -m '{"command":"turnOn","data":{},"timestamp":"2024-01-22T10:00:00Z"}'
```

## Flow hoạt động

### 1. Device gửi data → Mobile App

```
Device (MQTT)
  ↓ publish to: device/TEST001/data
MQTT Broker
  ↓ server subscribes
NestJS Server (MqttService)
  ↓ forward via SyncService
WebSocket Gateway
  ↓ emit to room: device:TEST001
Mobile App (receives real-time data)
```

### 2. Mobile App gửi command → Device

```
Mobile App (WebSocket)
  ↓ emit: sendCommand
WebSocket Gateway
  ↓ forward to SyncService
MQTT Service
  ↓ publish to: device/TEST001/command
MQTT Broker
  ↓ device subscribes
Device (executes command)
```

## Cấu trúc MQTT Topics

### Device → Server (Device publish)

- `device/{deviceId}/data` - Sensor data, telemetry
  ```json
  {
    "temperature": 25.5,
    "humidity": 60,
    "pressure": 1013,
    "timestamp": "2024-01-22T10:00:00Z"
  }
  ```

- `device/{deviceId}/status` - Device status
  ```json
  {
    "status": "online",
    "battery": 85,
    "signal": -65,
    "timestamp": "2024-01-22T10:00:00Z"
  }
  ```

### Server → Device (Device subscribe)

- `device/{deviceId}/command` - Commands
  ```json
  {
    "command": "turnOn",
    "data": { "duration": 60 },
    "timestamp": "2024-01-22T10:00:00Z"
  }
  ```

## WebSocket Events

### Client → Server (emit)

- `subscribeToDevice` - Subscribe to device updates
  ```javascript
  socket.emit('subscribeToDevice', { deviceId: 'uuid' });
  ```

- `unsubscribeFromDevice` - Unsubscribe
  ```javascript
  socket.emit('unsubscribeFromDevice', { deviceId: 'uuid' });
  ```

- `sendCommand` - Send command to device
  ```javascript
  socket.emit('sendCommand', {
    deviceId: 'uuid',
    command: 'turnOn',
    params: {}
  });
  ```

### Server → Client (on)

- `connected` - Connection confirmed
- `deviceData` - Real-time device data
- `deviceStatus` - Device status update
- `subscribed` - Subscription confirmed
- `commandQueued` - Command sent confirmation

## Troubleshooting

### MQTT không kết nối được

```bash
# Check if Mosquitto is running
docker ps | grep mosquitto

# Check logs
docker logs nest-websockets-chat-boilerplate-mosquitto-1

# Restart
docker-compose restart mosquitto
```

### WebSocket không connect

1. Check JWT token có hợp lệ
2. Check server đang chạy
3. Check CORS settings trong gateway

### Device simulator không gửi data

1. Check MQTT broker đang chạy
2. Check device ID đúng
3. Check network connection

## Development Tips

### Debug MQTT messages

```bash
# Monitor tất cả MQTT traffic
mosquitto_sub -h localhost -t "#" -v

# Monitor chỉ device data
mosquitto_sub -h localhost -t "device/+/data"

# Monitor chỉ commands
mosquitto_sub -h localhost -t "device/+/command"
```

### Test với nhiều devices

```bash
# Terminal 1
node test-mqtt-device.js DEVICE_001

# Terminal 2
node test-mqtt-device.js DEVICE_002

# Terminal 3
node test-mqtt-device.js DEVICE_003
```

### Monitor WebSocket connections

Mở browser console và:

```javascript
const socket = io('http://localhost:3000/device', {
  auth: { token: 'YOUR_TOKEN' }
});

socket.onAny((event, data) => {
  console.log(event, data);
});
```

## Production Deployment

Xem chi tiết tại: [MQTT_WEBSOCKET_SETUP.md](./MQTT_WEBSOCKET_SETUP.md)

### Checklist:

- [ ] Setup MQTT broker với authentication
- [ ] Configure SSL/TLS cho MQTT
- [ ] Setup WSS (WebSocket Secure)
- [ ] Configure firewall rules
- [ ] Setup monitoring & logging
- [ ] Implement device authentication
- [ ] Add rate limiting
- [ ] Setup database backup

## Resources

- [MQTT Protocol](https://mqtt.org/)
- [Socket.IO Documentation](https://socket.io/)
- [NestJS WebSockets](https://docs.nestjs.com/websockets/gateways)
- [Eclipse Mosquitto](https://mosquitto.org/)
