#!/usr/bin/env node

/**
 * MQTT Device Simulator
 * Simulates an IoT device sending data via MQTT
 * 
 * Usage:
 *   node test-mqtt-device.js [deviceId]
 * 
 * Example:
 *   node test-mqtt-device.js TEST001
 */

const mqtt = require('mqtt');

// Configuration
const BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const DEVICE_ID = process.argv[2] || `TEST_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

console.log('🔌 Starting MQTT Device Simulator');
console.log('📱 Device ID:', DEVICE_ID);
console.log('🌐 Broker:', BROKER_URL);
console.log('-----------------------------------\n');

// Connect to MQTT broker
const client = mqtt.connect(BROKER_URL, {
  clientId: DEVICE_ID,
  clean: true,
  reconnectPeriod: 1000,
});

let isConnected = false;

client.on('connect', () => {
  console.log('✅ Connected to MQTT broker');
  isConnected = true;

  // Subscribe to command topic
  const commandTopic = `device/${DEVICE_ID}/command`;
  client.subscribe(commandTopic, (err) => {
    if (err) {
      console.error('❌ Failed to subscribe to commands:', err);
    } else {
      console.log(`📥 Subscribed to: ${commandTopic}`);
    }
  });

  // Send initial status
  publishStatus('online', 100);

  console.log('\n🚀 Device is running. Press Ctrl+C to stop.\n');
});

client.on('error', (error) => {
  console.error('❌ Connection error:', error.message);
});

client.on('close', () => {
  console.log('🔌 Connection closed');
  isConnected = false;
});

client.on('reconnect', () => {
  console.log('🔄 Reconnecting...');
});

// Handle incoming commands
client.on('message', (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    console.log('📨 Received command:', payload);

    // Simulate command execution
    handleCommand(payload);
  } catch (error) {
    console.error('❌ Error parsing command:', error.message);
  }
});

// Publish sensor data periodically
let dataInterval = setInterval(() => {
  if (!isConnected) return;

  const sensorData = {
    temperature: (20 + Math.random() * 10).toFixed(1),
    humidity: (40 + Math.random() * 30).toFixed(1),
    pressure: (990 + Math.random() * 30).toFixed(1),
    timestamp: new Date().toISOString(),
  };

  publishData(sensorData);
}, 5000); // Every 5 seconds

// Publish status updates periodically
let statusInterval = setInterval(() => {
  if (!isConnected) return;

  const battery = Math.max(0, 100 - Math.random() * 2); // Slowly drain
  publishStatus('online', battery);
}, 30000); // Every 30 seconds

// Functions
function publishData(data) {
  const topic = `device/${DEVICE_ID}/data`;
  const payload = JSON.stringify(data);

  client.publish(topic, payload, { qos: 1 }, (err) => {
    if (err) {
      console.error('❌ Failed to publish data:', err);
    } else {
      console.log('📤 Published data:', data);
    }
  });
}

function publishStatus(status, battery) {
  const topic = `device/${DEVICE_ID}/status`;
  const payload = JSON.stringify({
    status,
    battery: battery.toFixed(0),
    signal: -65 - Math.random() * 20, // RSSI
    timestamp: new Date().toISOString(),
  });

  client.publish(topic, payload, { qos: 1 }, (err) => {
    if (err) {
      console.error('❌ Failed to publish status:', err);
    } else {
      console.log('📡 Published status:', status, `(Battery: ${battery.toFixed(0)}%)`);
    }
  });
}

function handleCommand(payload) {
  const { command, data } = payload;

  console.log(`⚡ Executing command: ${command}`);

  switch (command) {
    case 'turnOn':
      console.log('💡 Device turned ON');
      publishStatus('on', 98);
      break;

    case 'turnOff':
      console.log('💡 Device turned OFF');
      publishStatus('off', 98);
      break;

    case 'setTemperature':
      console.log(`🌡️  Temperature set to: ${data.value}°C`);
      publishData({
        temperature: data.value,
        humidity: 50,
        pressure: 1013,
        timestamp: new Date().toISOString(),
      });
      break;

    case 'reboot':
      console.log('🔄 Rebooting device...');
      publishStatus('rebooting', 95);
      setTimeout(() => {
        publishStatus('online', 95);
        console.log('✅ Device rebooted');
      }, 3000);
      break;

    case 'getStatus':
      console.log('📊 Sending current status...');
      publishStatus('online', 90);
      break;

    default:
      console.log(`❓ Unknown command: ${command}`);
      publishStatus('error', 90);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down device...');
  
  clearInterval(dataInterval);
  clearInterval(statusInterval);

  publishStatus('offline', 0);

  setTimeout(() => {
    client.end();
    process.exit(0);
  }, 1000);
});

// Send test data immediately on startup
setTimeout(() => {
  if (isConnected) {
    publishData({
      temperature: 23.5,
      humidity: 55,
      pressure: 1013,
      timestamp: new Date().toISOString(),
    });
  }
}, 2000);
