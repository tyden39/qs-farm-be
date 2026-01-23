# MQTT & WebSocket Setup Guide

## Architecture Overview

```
Physical Device (MQTT) <---> NestJS Server <---> Mobile App (WebSocket)
```

- **Devices** communicate via MQTT (lightweight, IoT-optimized protocol)
- **Mobile Apps** communicate via WebSocket (real-time bidirectional)
- **Server** acts as a bridge, synchronizing data between both protocols

## Environment Variables

Add these to your `.env` file:

```env
# MQTT Configuration
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=
MQTT_PASSWORD=

# JWT (already configured)
JWT_ACCESS_SECRET=your_secret
JWT_ACCESS_EXPIRE=1h
JWT_REFRESH_SECRET=your_refresh_secret
JWT_REFRESH_EXPIRE=7d
```

## MQTT Broker Setup

### Option 1: Using Docker (Recommended)

Add Mosquitto MQTT broker to your `docker-compose.yml`:

```yaml
mosquitto:
  image: eclipse-mosquitto:2
  ports:
    - "1883:1883"
    - "9001:9001"
  volumes:
    - ./mosquitto/config:/mosquitto/config
    - ./mosquitto/data:/mosquitto/data
    - ./mosquitto/log:/mosquitto/log
  restart: unless-stopped
```

Create `mosquitto/config/mosquitto.conf`:

```
listener 1883
allow_anonymous true
persistence true
persistence_location /mosquitto/data/
log_dest file /mosquitto/log/mosquitto.log
```

Start the broker:
```bash
docker-compose up -d mosquitto
```

### Option 2: Install Locally

**Ubuntu/Debian:**
```bash
sudo apt-get install mosquitto mosquitto-clients
sudo systemctl start mosquitto
sudo systemctl enable mosquitto
```

**macOS:**
```bash
brew install mosquitto
brew services start mosquitto
```

## MQTT Topics Structure

### From Device to Server (Publish by Device)

- `device/{deviceId}/data` - Sensor data, telemetry
- `device/{deviceId}/status` - Device status updates (online, battery, etc.)

Example payload for data:
```json
{
  "temperature": 25.5,
  "humidity": 60,
  "timestamp": "2024-01-22T10:30:00Z"
}
```

Example payload for status:
```json
{
  "status": "online",
  "battery": 85,
  "signal": -65
}
```

### From Server to Device (Subscribe by Device)

- `device/{deviceId}/command` - Commands from mobile app/server

Example payload:
```json
{
  "command": "setTemperature",
  "data": {
    "value": 22
  },
  "timestamp": "2024-01-22T10:30:00Z"
}
```

## WebSocket Connection (Mobile App)

### Connect to WebSocket

```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:3000/device', {
  auth: {
    token: 'YOUR_JWT_TOKEN'
  }
});

socket.on('connected', (data) => {
  console.log('Connected to device WebSocket', data);
});
```

### Subscribe to Device Updates

```javascript
// Subscribe to specific device
socket.emit('subscribeToDevice', { deviceId: 'device-uuid' });

// Listen for device data
socket.on('deviceData', (data) => {
  console.log('Device data:', data);
  // { deviceId, data: {...}, timestamp }
});

// Listen for device status
socket.on('deviceStatus', (data) => {
  console.log('Device status:', data);
  // { deviceId, status: {...}, timestamp }
});
```

### Send Command to Device

```javascript
socket.emit('sendCommand', {
  deviceId: 'device-uuid',
  command: 'turnOn',
  params: { duration: 60 }
});

// Or via HTTP API
fetch('http://localhost:3000/api/device/{id}/command', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    command: 'turnOn',
    params: { duration: 60 }
  })
});
```

## API Endpoints

### Send Command to Device
```
POST /api/device/:id/command
Authorization: Bearer {token}

Body:
{
  "command": "string",
  "params": {} // optional
}
```

### Check Device Status
```
GET /api/device/:id/status
Authorization: Bearer {token}

Response:
{
  "deviceId": "uuid",
  "imei": "string",
  "online": boolean,
  "timestamp": "ISO date"
}
```

## Testing

### Test MQTT with mosquitto_pub/sub

Subscribe to messages:
```bash
mosquitto_sub -h localhost -t "device/+/data"
```

Publish test message:
```bash
mosquitto_pub -h localhost -t "device/TEST001/data" -m '{"temperature": 25, "humidity": 60}'
```

### Test WebSocket with Browser Console

```javascript
const socket = io('http://localhost:3000/device', {
  auth: { token: 'YOUR_JWT_TOKEN' }
});

socket.on('connect', () => console.log('Connected'));
socket.on('deviceData', (data) => console.log('Data:', data));

socket.emit('subscribeToDevice', { deviceId: 'TEST001' });
```

## Device Implementation Example (Arduino/ESP32)

```cpp
#include <WiFi.h>
#include <PubSubClient.h>

const char* mqtt_server = "your-server-ip";
const char* deviceId = "ESP32_001";

WiFiClient espClient;
PubSubClient client(espClient);

void setup() {
  Serial.begin(115200);
  
  // Connect WiFi
  WiFi.begin("SSID", "PASSWORD");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }
  
  // Connect MQTT
  client.setServer(mqtt_server, 1883);
  client.setCallback(callback);
  
  reconnect();
  
  // Subscribe to commands
  String topic = "device/" + String(deviceId) + "/command";
  client.subscribe(topic.c_str());
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();
  
  // Publish sensor data every 10 seconds
  static unsigned long lastMsg = 0;
  if (millis() - lastMsg > 10000) {
    lastMsg = millis();
    
    String topic = "device/" + String(deviceId) + "/data";
    String payload = "{\"temperature\": 25.5, \"humidity\": 60}";
    client.publish(topic.c_str(), payload.c_str());
  }
}

void callback(char* topic, byte* payload, unsigned int length) {
  // Handle incoming commands
  String message;
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  
  // Parse JSON and execute command
  Serial.println("Received command: " + message);
}

void reconnect() {
  while (!client.connected()) {
    if (client.connect(deviceId)) {
      Serial.println("MQTT Connected");
    } else {
      delay(5000);
    }
  }
}
```

## React Native Example

```javascript
import React, { useEffect, useState } from 'react';
import io from 'socket.io-client';

function DeviceMonitor({ deviceId, token }) {
  const [deviceData, setDeviceData] = useState(null);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const newSocket = io('http://localhost:3000/device', {
      auth: { token }
    });

    newSocket.on('connected', () => {
      console.log('Connected to WebSocket');
      newSocket.emit('subscribeToDevice', { deviceId });
    });

    newSocket.on('deviceData', (data) => {
      setDeviceData(data);
    });

    newSocket.on('deviceStatus', (status) => {
      console.log('Device status:', status);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [deviceId, token]);

  const sendCommand = (command, params) => {
    socket?.emit('sendCommand', { deviceId, command, params });
  };

  return (
    <View>
      <Text>Device ID: {deviceId}</Text>
      <Text>Temperature: {deviceData?.data?.temperature}</Text>
      <Button 
        title="Turn On" 
        onPress={() => sendCommand('turnOn', {})} 
      />
    </View>
  );
}
```

## Troubleshooting

### MQTT Connection Issues

1. Check if MQTT broker is running:
```bash
netstat -an | grep 1883
```

2. Test connection:
```bash
mosquitto_sub -h localhost -t "#" -v
```

### WebSocket Connection Issues

1. Check JWT token is valid
2. Verify CORS settings in gateway
3. Check browser console for errors

### Device Not Receiving Commands

1. Verify device is subscribed to correct topic: `device/{deviceId}/command`
2. Check MQTT broker logs
3. Use mosquitto_pub to test:
```bash
mosquitto_pub -h localhost -t "device/TEST001/command" -m '{"command":"test","data":{}}'
```
