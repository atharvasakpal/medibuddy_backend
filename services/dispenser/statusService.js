// services/dispenser/statusService.js
const { db } = require('../../config/database.js');
const notificationService = require('../notification');

/**
 * Handle status updates received from dispenser devices
 * @param {Object} device The device document from database
 * @param {Object} payload The status update payload
 * @returns {Promise<void>}
 */
exports.handleStatusUpdate = async (device, payload) => {
  try {
    const { status, batteryLevel, errorCode, timestamp } = payload;
    
    // Update device status in database
    await db.dispenserDevices.update({
      where: { deviceId: device.deviceId },
      data: {
        status,
        batteryLevel,
        errorCode,
        lastSeen: new Date(timestamp) || new Date()
      }
    });
    
    console.log(`Updated status for device ${device.deviceId}: ${status}`);
    
    // Check if this is an error status
    if (status === 'ERROR' && errorCode) {
      // Create notification for the error
      await notificationService.createNotification(
        device.userId,
        'DEVICE_ERROR',
        'Dispenser Error Detected',
        `Your medicine dispenser has reported error code: ${errorCode}`,
        {
          deviceId: device.deviceId,
          errorCode,
          timestamp
        }
      );
      
      console.log(`Created error notification for device ${device.deviceId}`);
    }
    
    // Check for low battery
    if (batteryLevel && batteryLevel < 20) {
      await notificationService.createNotification(
        device.userId,
        'LOW_BATTERY',
        'Low Battery Warning',
        `Your medicine dispenser's battery level is low (${batteryLevel}%). Please charge the device soon.`,
        {
          deviceId: device.deviceId,
          batteryLevel,
          timestamp
        }
      );
      
      console.log(`Created low battery notification for device ${device.deviceId}`);
    }
  } catch (error) {
    console.error('Error handling status update:', error);
  }
};