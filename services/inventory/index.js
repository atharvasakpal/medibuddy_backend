// services/inventory/index.js
const { db } = require('../../config/database.js');

class InventoryService {
  /**
   * Get current inventory levels for a specific device
   * @param {string} deviceId The device ID to get inventory for
   * @returns {Promise<Array>} List of medications with inventory information
   */
  async getInventory(deviceId) {
    try {
      const inventory = await db.dispenserSlots.findMany({
        where: { deviceId },
        include: { medication: true }
      });
      
      return inventory.map(slot => ({
        deviceId: slot.deviceId,
        slotNumber: slot.slotNumber,
        medicationId: slot.medicationId,
        medicationName: slot.medication?.name || 'Unknown',
        pillCount: slot.pillCount,
        lowStock: slot.pillCount < (slot.medication?.lowStockThreshold || 5),
        lastDispensed: slot.lastDispensed
      }));
    } catch (error) {
      console.error('Inventory fetch error:', error);
      throw new Error(`Failed to get inventory: ${error.message}`);
    }
  }
  
  /**
   * Check if any medications are low on stock for a device
   * @param {string} deviceId The device ID to check
   * @returns {Promise<Array>} List of medications that need refilling
   */
  async checkLowStock(deviceId) {
    try {
      const slots = await db.dispenserSlots.findMany({
        where: { deviceId },
        include: { medication: true }
      });
      
      return slots.filter(slot => 
        slot.pillCount < (slot.medication?.lowStockThreshold || 5)
      ).map(slot => ({
        deviceId: slot.deviceId,
        slotNumber: slot.slotNumber,
        medicationName: slot.medication?.name || 'Unknown',
        currentCount: slot.pillCount,
        threshold: slot.medication?.lowStockThreshold || 5
      }));
    } catch (error) {
      console.error('Low stock check error:', error);
      throw new Error(`Failed to check low stock: ${error.message}`);
    }
  }
  
  /**
   * Updates the pill count for a medication slot
   * @param {string} deviceId The device ID
   * @param {number} slotNumber The slot to update
   * @param {number} newCount The new pill count
   * @returns {Promise<Object>} Result of the update operation
   */
  async updatePillCount(deviceId, slotNumber, newCount) {
    try {
      if (newCount < 0) {
        return { success: false, message: 'Pill count cannot be negative' };
      }
      
      // Check if the device exists
      const device = await db.dispenserDevices.findUnique({
        where: { deviceId }
      });
      
      if (!device) {
        return { success: false, message: `Device ${deviceId} not found` };
      }
      
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
      
      // Update the pill count in the database
      await db.dispenserSlots.update({
        where: { 
          deviceId_slotNumber: {
            deviceId,
            slotNumber
          }
        },
        data: { 
          pillCount: newCount,
          updatedAt: new Date()
        }
      });
      
      // Log the inventory change
      if (newCount > slot.pillCount) {
        await db.inventoryLog.create({
          data: {
            deviceId,
            medicationId: slot.medicationId,
            slotNumber,
            previousCount: slot.pillCount,
            newCount,
            changeType: 'REFILL',
            timestamp: new Date()
          }
        });
      } else if (newCount < slot.pillCount) {
        await db.inventoryLog.create({
          data: {
            deviceId,
            medicationId: slot.medicationId,
            slotNumber,
            previousCount: slot.pillCount,
            newCount,
            changeType: 'ADJUSTMENT',
            timestamp: new Date()
          }
        });
      }
      
      // Send the update to the device via MQTT
      const { publishToDevice } = require('../../mqtt/mqttClient');
      publishToDevice(deviceId, 'update_inventory', {
        slotNumber,
        pillCount: newCount,
        timestamp: new Date().toISOString()
      });
      
      return { 
        success: true, 
        message: `Updated pill count for ${slot.medication?.name || 'medication'} to ${newCount}` 
      };
    } catch (error) {
      console.error('Pill count update error:', error);
      return { success: false, message: `Failed to update pill count: ${error.message}` };
    }
  }
}

// Create singleton instance
const inventoryService = new InventoryService();

module.exports = inventoryService;