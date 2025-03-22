// services/inventory/inventoryService.js
const { db } = require('../../config/database.js');
const notificationService = require('../notification');

/**
 * Handle inventory updates received from dispenser devices
 * @param {Object} device The device document from database
 * @param {Object} payload The inventory update payload
 * @returns {Promise<void>}
 */
exports.handleInventoryUpdate = async (device, payload) => {
  try {
    const { slotNumber, pillCount, timestamp } = payload;
    
    // Find the current slot info
    const slot = await db.dispenserSlots.findFirst({
      where: { 
        deviceId: device.deviceId,
        slotNumber 
      },
      include: { medication: true }
    });
    
    if (!slot) {
      console.error(`Slot ${slotNumber} not found for device ${device.deviceId}`);
      return;
    }
    
    const previousCount = slot.pillCount;
    
    // Update the pill count
    await db.dispenserSlots.update({
      where: { 
        deviceId_slotNumber: {
          deviceId: device.deviceId,
          slotNumber
        }
      },
      data: { 
        pillCount,
        updatedAt: new Date(timestamp) || new Date()
      }
    });
    
    console.log(`Updated pill count for device ${device.deviceId}, slot ${slotNumber} to ${pillCount}`);
    
    // Log the inventory change
    const changeType = pillCount > previousCount ? 'REFILL' : 
                       pillCount < previousCount ? 'CONSUMPTION' : 'SYNC';
    
    await db.inventoryLog.create({
      data: {
        deviceId: device.deviceId,
        medicationId: slot.medicationId,
        slotNumber,
        previousCount,
        newCount: pillCount,
        changeType,
        timestamp: new Date(timestamp) || new Date()
      }
    });
    
    // Check if inventory is now low
    if (slot.medication && 
        pillCount <= slot.medication.lowStockThreshold && 
        previousCount > slot.medication.lowStockThreshold) {
      
      // Send low inventory notification
      await notificationService.createNotification(
        device.userId,
        'LOW_INVENTORY',
        'Medication Running Low',
        `Your ${slot.medication.name} is running low. Only ${pillCount} dose(s) remaining.`,
        {
          deviceId: device.deviceId,
          medicationId: slot.medicationId,
          medicationName: slot.medication.name,
          remainingDoses: pillCount
        }
      );
      
      console.log(`Created low inventory notification for ${slot.medication.name}`);
    }
  } catch (error) {
    console.error('Error handling inventory update:', error);
  }
};