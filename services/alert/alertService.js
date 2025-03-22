// services/alert/alertService.js
const { db } = require('../../config/database');
const notificationService = require('../notification');

/**
 * Handle alerts received from dispenser devices
 * @param {Object} device The device document from database
 * @param {Object} payload The alert payload
 * @returns {Promise<void>}
 */
exports.handleDispenserAlert = async (device, payload) => {
  try {
    const { 
      alertType, 
      severity, 
      message, 
      data,
      timestamp 
    } = payload;
    
    // Log the alert
    await db.alertLogs.create({
      data: {
        deviceId: device.deviceId,
        alertType,
        severity,
        message,
        data: JSON.stringify(data || {}),
        timestamp: new Date(timestamp) || new Date()
      }
    });
    
    console.log(`Logged ${severity} alert for device ${device.deviceId}: ${alertType}`);
    
    // Determine notification type based on alert type
    let notificationType;
    let title;
    
    switch (alertType) {
      case 'TAMPER_DETECTED':
        notificationType = 'SECURITY_ALERT';
        title = 'Security Alert: Dispenser Tampering';
        break;
      case 'MECHANICAL_JAM':
        notificationType = 'DEVICE_ERROR';
        title = 'Dispenser Mechanical Issue';
        break;
      case 'POWER_OUTAGE':
        notificationType = 'DEVICE_ERROR';
        title = 'Dispenser Power Issue';
        break;
      case 'CONNECTIVITY_ISSUE':
        notificationType = 'DEVICE_ERROR';
        title = 'Dispenser Connection Issue';
        break;
      case 'MISSED_DOSE':
        notificationType = 'MISSED_DOSE';
        title = 'Missed Medication Dose';
        break;
      default:
        notificationType = 'GENERAL_ALERT';
        title = `Dispenser Alert: ${alertType}`;
    }
    
    // For critical or high severity alerts, send notification to user
    if (severity === 'CRITICAL' || severity === 'HIGH') {
      await notificationService.createNotification(
        device.userId,
        notificationType,
        title,
        message || `Your medicine dispenser has reported a ${severity.toLowerCase()} severity alert.`,
        {
          deviceId: device.deviceId,
          alertType,
          severity,
          ...data
        }
      );
      
      console.log(`Created notification for ${severity} alert: ${alertType}`);
      
      // For critical alerts, also notify caregivers if configured
      if (severity === 'CRITICAL') {
        const caregivers = await db.caregivers.findMany({
          where: { userId: device.userId, notificationsEnabled: true }
        });
        
        for (const caregiver of caregivers) {
          await notificationService.createNotification(
            caregiver.caregiverId,
            notificationType,
            `ALERT for ${device.user.firstName}: ${title}`,
            `${device.user.firstName} ${device.user.lastName}'s dispenser has reported a critical alert: ${message}`,
            {
              deviceId: device.deviceId,
              userId: device.userId,
              userName: `${device.user.firstName} ${device.user.lastName}`,
              alertType,
              severity,
              ...data
            }
          );
          
          console.log(`Created notification for caregiver ${caregiver.caregiverId}`);
        }
      }
    }
  } catch (error) {
    console.error('Error handling dispenser alert:', error);
  }
};