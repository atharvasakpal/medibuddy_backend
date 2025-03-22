// services/dispenser/index.js
const { db } = require('../../config/database.js');
const { publishToDevice } = require('../../mqtt/mqttClient.js');

class DispenserService {
  constructor() {
    this.status = 'IDLE';
  }
  
  /**
   * Dispenses a medication at the specified slot
   * @param {string} deviceId The device ID of the dispenser
   * @param {number} slotNumber The physical slot number in the dispenser
   * @returns {Promise<Object>} Promise resolving to success or error message
   */
  async dispenseMedication(deviceId, slotNumber) {
    try {
      // Check if device exists
      const device = await db.dispenserDevices.findUnique({
        where: { deviceId }
      });
      
      if (!device) {
        return { success: false, message: `Device ${deviceId} not found` };
      }
      
      // Check if slot exists and has medication
      const slot = await db.dispenserSlots.findFirst({
        where: { 
          deviceId,
          slotNumber 
        },
        include: { medication: true }
      });
      
      if (!slot) {
        return { success: false, message: `Slot ${slotNumber} not found` };
      }
      
      if (!slot.medication) {
        return { success: false, message: `No medication in slot ${slotNumber}` };
      }
      
      if (slot.pillCount <= 0) {
        return { success: false, message: `Slot ${slotNumber} is empty` };
      }
      
      // Create a pending dispensing record
      const dispensingRecord = await db.dispensingLog.create({
        data: {
          deviceId,
          medicationId: slot.medicationId,
          slotNumber,
          requestedAt: new Date(),
          status: 'PENDING',
          quantity: 1
        }
      });
      
      // Send message to device via MQTT
      const success = publishToDevice(deviceId, 'dispense', {
        slotNumber,
        medicationId: slot.medicationId,
        quantity: 1,
        requestId: dispensingRecord.id
      });
      
      if (!success) {
        // Update record to failure if MQTT publish failed
        await db.dispensingLog.update({
          where: { id: dispensingRecord.id },
          data: { 
            status: 'FAILED',
            errorMessage: 'Failed to connect to dispenser device'
          }
        });
        
        return { success: false, message: 'Failed to connect to dispenser device' };
      }
      
      return { 
        success: true, 
        message: `Dispensing request sent for ${slot.medication.name}`,
        requestId: dispensingRecord.id
      };
      
    } catch (error) {
      console.error('Dispenser error:', error);
      return { success: false, message: `Dispensing error: ${error.message}` };
    }
  }
  
  /**
   * Get the current status of the dispenser
   * @param {string} deviceId The device ID to get status for
   * @returns {Promise<Object>} The current dispenser status
   */
  async getStatus(deviceId) {
    try {
      const device = await db.dispenserDevices.findUnique({
        where: { deviceId }
      });
      
      if (!device) {
        return { success: false, message: `Device ${deviceId} not found` };
      }
      
      return {
        success: true,
        status: device.status,
        lastSeen: device.lastSeen,
        batteryLevel: device.batteryLevel,
        errorCode: device.errorCode
      };
    } catch (error) {
      console.error('Get status error:', error);
      return { success: false, message: `Failed to get status: ${error.message}` };
    }
  }
  
  /**
   * Calibrates the dispenser mechanism
   * @param {string} deviceId The device ID to calibrate
   * @returns {Promise<Object>} Promise resolving to calibration result
   */
  async calibrate(deviceId) {
    try {
      // Check if device exists
      const device = await db.dispenserDevices.findUnique({
        where: { deviceId }
      });
      
      if (!device) {
        return { success: false, message: `Device ${deviceId} not found` };
      }
      
      // Send calibration command via MQTT
      const success = publishToDevice(deviceId, 'calibrate', {
        timestamp: new Date().toISOString()
      });
      
      if (!success) {
        return { success: false, message: 'Failed to connect to dispenser device' };
      }
      
      // Create maintenance log entry
      await db.maintenanceLogs.create({
        data: {
          deviceId,
          actionType: 'CALIBRATION',
          requestedAt: new Date(),
          status: 'PENDING'
        }
      });
      
      return { success: true, message: 'Calibration request sent to device' };
    } catch (error) {
      console.error('Calibration error:', error);
      return { success: false, message: `Calibration error: ${error.message}` };
    }
  }
  
  /**
   * Configures a dispenser slot for a specific medication
   * @param {string} deviceId The device ID
   * @param {number} slotNumber The slot to configure
   * @param {string} medicationId The medication ID to assign to the slot
   * @param {number} pillCount Initial pill count to set
   * @returns {Promise<Object>} Promise resolving to configuration result
   */
  async configureSlot(deviceId, slotNumber, medicationId, pillCount) {
    try {
      // Check if the device exists
      const device = await db.dispenserDevices.findUnique({
        where: { deviceId }
      });
      
      if (!device) {
        return { success: false, message: `Device ${deviceId} not found` };
      }
      
      // Check if the medication exists
      const medication = await db.medications.findUnique({
        where: { id: medicationId }
      });
      
      if (!medication) {
        return { success: false, message: 'Medication not found' };
      }
      
      // Update or create the slot configuration
      await db.dispenserSlots.upsert({
        where: { 
          deviceId_slotNumber: {
            deviceId,
            slotNumber
          }
        },
        update: { 
          medicationId,
          pillCount,
          updatedAt: new Date()
        },
        create: {
          deviceId,
          slotNumber,
          medicationId,
          pillCount,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });
      
      // Send configuration to device via MQTT
      const success = publishToDevice(deviceId, 'configure', {
        slotNumber,
        medicationId,
        medicationName: medication.name,
        dosageInfo: medication.dosage,
        pillCount
      });
      
      if (!success) {
        return { success: false, message: 'Failed to connect to dispenser device' };
      }
      
      return { 
        success: true, 
        message: `Slot ${slotNumber} configured for ${medication.name} with ${pillCount} pills` 
      };
    } catch (error) {
      console.error('Configuration error:', error);
      return { success: false, message: `Configuration error: ${error.message}` };
    }
  }
}

// Create singleton instance
const dispenserService = new DispenserService();

module.exports = dispenserService;