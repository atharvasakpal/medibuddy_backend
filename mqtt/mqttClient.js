import mqtt from 'mqtt';
import dotenv from 'dotenv';

dotenv.config();

class MQTTController {
  constructor() {
    this.MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
    this.client = null;
    this.deviceState = {
      batteryLevel: 100,
      inventoryLevels: {
        // Example medication compartments
        compartment1: { medication: 'Aspirin', quantity: 30 },
        compartment2: { medication: 'Ibuprofen', quantity: 20 }
      },
      dispensingLog: [],
      lastDispensed: null
    };
  }

  // Initialize MQTT Connection
  connect() {
    console.log('Connecting to MQTT broker...');
    
    this.client = mqtt.connect(this.MQTT_BROKER_URL);
    
    this.client.on('connect', () => {
      console.log('Connected to MQTT broker');
      
      // Subscribe to relevant topics
      this.client.subscribe('dispenser/command');
      this.client.subscribe('dispenser/inventory');
      this.client.subscribe('dispenser/device-status');
    });
    
    // Message handling
    this.client.on('message', (topic, message) => {
      try {
        const payload = JSON.parse(message.toString());
        
        switch (topic) {
          case 'dispenser/command':
            this.handleCommand(payload);
            break;
          case 'dispenser/inventory':
            this.updateInventory(payload);
            break;
          case 'dispenser/device-status':
            this.updateDeviceStatus(payload);
            break;
        }
      } catch (error) {
        console.error('Error processing message:', error);
      }
    });
    
    // Error handling
    this.client.on('error', (err) => {
      console.error('MQTT connection error:', err);
    });
  }

  // Scheduled Medication Dispensing
  handleCommand(payload) {
    switch (payload.type) {
      case 'dispense':
        this.dispense(payload);
        break;
      case 'schedule':
        this.scheduleDispensing(payload);
        break;
    }
  }

  // Dispense Medication
  dispense(payload) {
    const { compartment, medication } = payload;
    
    // Check inventory
    if (this.deviceState.inventoryLevels[compartment].quantity > 0) {
      // Decrease inventory
      this.deviceState.inventoryLevels[compartment].quantity -= 1;
      
      // Log dispensing event
      const dispensingEvent = {
        timestamp: new Date(),
        medication: medication,
        compartment: compartment
      };
      
      this.deviceState.dispensingLog.push(dispensingEvent);
      this.deviceState.lastDispensed = dispensingEvent;
      
      // Publish dispensing confirmation
      this.publishMessage('dispenser/dispensed', {
        status: 'success',
        ...dispensingEvent
      });
      
      // Check low inventory
      this.checkInventoryLevels(compartment);
    } else {
      // Publish error if no medication available
      this.publishMessage('dispenser/dispensed', {
        status: 'error',
        message: 'Low inventory in compartment'
      });
    }
  }

  // Schedule Medication Dispensing
  scheduleDispensing(payload) {
    // Placeholder for scheduling logic
    console.log('Medication schedule set:', payload);
    this.publishMessage('dispenser/schedule-confirmation', {
      status: 'scheduled',
      details: payload
    });
  }

  // Inventory Tracking
  updateInventory(payload) {
    const { compartment, quantity } = payload;
    
    if (this.deviceState.inventoryLevels[compartment]) {
      this.deviceState.inventoryLevels[compartment].quantity = quantity;
      this.checkInventoryLevels(compartment);
    }
  }

  // Check Inventory Levels
  checkInventoryLevels(compartment) {
    const inventoryLevel = this.deviceState.inventoryLevels[compartment].quantity;
    
    if (inventoryLevel < 10) {
      this.publishMessage('dispenser/alerts', {
        type: 'low-inventory',
        compartment: compartment,
        currentQuantity: inventoryLevel
      });
    }
  }

  // Device Health Monitoring
  updateDeviceStatus(payload) {
    const { batteryLevel } = payload;
    
    this.deviceState.batteryLevel = batteryLevel;
    
    // Battery low alert
    if (batteryLevel < 20) {
      this.publishMessage('dispenser/alerts', {
        type: 'low-battery',
        currentBattery: batteryLevel
      });
    }
  }

  // Publish Message Utility
  publishMessage(topic, payload) {
    if (this.client && this.client.connected) {
      this.client.publish(topic, JSON.stringify(payload));
      console.log(`Message published to ${topic}:`, payload);
    } else {
      console.error('Cannot publish - not connected');
    }
  }

  // Retrieve Adherence Log
  getAdherenceLog() {
    return this.deviceState.dispensingLog;
  }
}

export default new MQTTController();


















// import mqtt from 'mqtt';
// import dotenv from 'dotenv';
// import DispenserDevice from '../models/dispenserDeviceModel.js';
// import { handleStatusUpdate } from '../services/dispenser/statusService.js';
// import { handleDispensedConfirmation } from '../services/dispenser/dispensingService.js';
// import { handleInventoryUpdate } from '../services/inventory/inventoryService.js';
// import { handleDispenserAlert } from '../services/alert/alertService.js';

// dotenv.config();

// const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
// const MQTT_USERNAME = process.env.MQTT_USERNAME;
// const MQTT_PASSWORD = process.env.MQTT_PASSWORD;

// let client;

// // Function to set up MQTT client and subscribe to topics
// const setupMQTT = () => {
//   console.log('Connecting to MQTT broker...');
  
//   const options = {
//     username: MQTT_USERNAME,
//     password: MQTT_PASSWORD,
//     reconnectPeriod: 5000
//   };
  
//   client = mqtt.connect(MQTT_BROKER_URL, options);
  
//   client.on('connect', () => {
//     console.log('Connected to MQTT broker');
    
//     // Subscribe to relevant topics
//     client.subscribe('dispenser/+/status');
//     client.subscribe('dispenser/+/dispensed');
//     client.subscribe('dispenser/+/alerts');
//     client.subscribe('dispenser/+/inventory');
    
//     console.log('Subscribed to dispenser topics');
//   });
  
//   client.on('message', async (topic, message) => {
//     console.log(`Received message on topic: ${topic}`);
    
//     try {
//       const payload = JSON.parse(message.toString());
//       const topicParts = topic.split('/');
      
//       if (topicParts.length !== 3) return;
      
//       const deviceId = topicParts[1];
//       const messageType = topicParts[2];
      
//       // Find the device in the database
//       const device = await DispenserDevice.findOne({ deviceId });
      
//       if (!device) {
//         console.error(`Unknown device ID: ${deviceId}`);
//         return;
//       }
      
//       // Route message to appropriate handler
//       switch (messageType) {
//         case 'status':
//           await handleStatusUpdate(device, payload);
//           break;
//         case 'dispensed':
//           await handleDispensedConfirmation(device, payload);
//           break;
//         case 'inventory':
//           await handleInventoryUpdate(device, payload);
//           break;
//         case 'alerts':
//           await handleDispenserAlert(device, payload);
//           break;
//         default:
//           console.log(`Unknown message type: ${messageType}`);
//       }
//     } catch (error) {
//       console.error('Error processing MQTT message:', error);
//     }
//   });
  
//   client.on('error', (err) => {
//     console.error('MQTT client error:', err);
//   });
  
//   return client;
// };

// // Function to publish a message to a specific device
// export const publishToDevice = (deviceId, messageType, payload) => {
//   if (!client || !client.connected) {
//     console.error('MQTT client not connected');
//     return false;
//   }
  
//   const topic = `dispenser/${deviceId}/${messageType}`;
//   client.publish(topic, JSON.stringify(payload));
//   console.log(`Published to ${topic}`);
//   return true;
// };

// export default setupMQTT;


