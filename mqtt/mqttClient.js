import mqtt from 'mqtt';
import dotenv from 'dotenv';
import DispenserDevice from '../models/dispenserDevice.model.js';
import { handleStatusUpdate } from '../services/dispenser/statusService.js';
import { handleDispensedConfirmation } from '../services/dispenser/dispensingService.js';
import { handleInventoryUpdate } from '../services/inventory/inventoryService.js';
import { handleDispenserAlert } from '../services/alert/alertService.js';

dotenv.config();

const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const MQTT_USERNAME = process.env.MQTT_USERNAME;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD;

let client;

// Function to set up MQTT client and subscribe to topics
const setupMQTT = () => {
  console.log('Connecting to MQTT broker...');
  
  const options = {
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
    reconnectPeriod: 5000
  };
  
  client = mqtt.connect(MQTT_BROKER_URL, options);
  
  client.on('connect', () => {
    console.log('Connected to MQTT broker');
    
    // Subscribe to relevant topics
    client.subscribe('dispenser/+/status');
    client.subscribe('dispenser/+/dispensed');
    client.subscribe('dispenser/+/alerts');
    client.subscribe('dispenser/+/inventory');
    
    console.log('Subscribed to dispenser topics');
  });
  
  client.on('message', async (topic, message) => {
    console.log(`Received message on topic: ${topic}`);
    
    try {
      const payload = JSON.parse(message.toString());
      const topicParts = topic.split('/');
      
      if (topicParts.length !== 3) return;
      
      const deviceId = topicParts[1];
      const messageType = topicParts[2];
      
      // Find the device in the database
      const device = await DispenserDevice.findOne({ deviceId });
      
      if (!device) {
        console.error(`Unknown device ID: ${deviceId}`);
        return;
      }
      
      // Route message to appropriate handler
      switch (messageType) {
        case 'status':
          await handleStatusUpdate(device, payload);
          break;
        case 'dispensed':
          await handleDispensedConfirmation(device, payload);
          break;
        case 'inventory':
          await handleInventoryUpdate(device, payload);
          break;
        case 'alerts':
          await handleDispenserAlert(device, payload);
          break;
        default:
          console.log(`Unknown message type: ${messageType}`);
      }
    } catch (error) {
      console.error('Error processing MQTT message:', error);
    }
  });
  
  client.on('error', (err) => {
    console.error('MQTT client error:', err);
  });
  
  return client;
};

// Function to publish a message to a specific device
export const publishToDevice = (deviceId, messageType, payload) => {
  if (!client || !client.connected) {
    console.error('MQTT client not connected');
    return false;
  }
  
  const topic = `dispenser/${deviceId}/${messageType}`;
  client.publish(topic, JSON.stringify(payload));
  console.log(`Published to ${topic}`);
  return true;
};

export default setupMQTT;