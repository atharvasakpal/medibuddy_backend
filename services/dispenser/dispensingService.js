// services/dispenser/dispensingService.js
const { db } = require('../../config/database.js');
const notificationService = require('../notification');

/**
 * Handle dispensed confirmation from device
 * @param {Object} device The device document from database
 * @param {Object} payload The dispensed confirmation payload
 * @returns {Promise<void>}
 */
exports.handleDispensedConfirmation = async (device, payload) => {
  try {
    const { 
      requestId, 
      slotNumber, 
      medicationId, 
      success,
      errorMessage,
      timestamp 
    } = payload;
    
    // Find the pending dispensing record
    const dispensingRecord = await db.dispensingLog.findUnique({
      where: { id: requestId }
    });
    
    if (!dispensingRecord) {
      console.error(`Dispensing record not found for request ID: ${requestId}`);
      return;
    }
    
    // Update the dispensing record
    await db.dispensingLog.update({
      where: { id: requestId },
      data: {
        status: success ? 'COMPLETED' : 'FAILED',
        completedAt: new Date(timestamp) || new Date(),
        errorMessage: success ? null : (errorMessage || 'Unknown error')
      }
    });
    
    console.log(`Updated dispensing record ${requestId} to ${success ? 'COMPLETED' : 'FAILED'}`);
    
    // If successful, update the inventory
    if (success) {
      // Get slot information
      const slot = await db.dispenserSlots.findFirst({
        where: { 
          deviceId: device.deviceId,
          slotNumber
        },
        include: { medication: true }
      });
      
      if (slot) {
        // Update pill count
        await db.dispenserSlots.update({
          where: { 
            deviceId_slotNumber: {
              deviceId: device.deviceId,
              slotNumber
            }
          },
          data: { 
            pillCount: Math.max(0, slot.pillCount - 1),
            lastDispensed: new Date(timestamp) || new Date()
          }
        });
        
        console.log(`Updated pill count for slot ${slotNumber}`);
        
        // Check if this was a scheduled dose
        const scheduledDose = await db.reminderLogs.findFirst({
          where: {
            medicationId,
            userId: device.userId,
            status: 'SENT',
            scheduledTime: {
              // Look for reminders in the last hour
              gte: new Date(new Date().getTime() - 60 * 60 * 1000)
            }
          }
        });
        
        if (scheduledDose) {
          // Update the reminder log
          await db.reminderLogs.update({
            where: { id: scheduledDose.id },
            data: {
              status: 'TAKEN',
              responseTime: new Date()
            }
          });
          
          console.log(`Updated scheduled dose ${scheduledDose.id} as TAKEN`);
        }
        
        // Check if inventory is low after dispensing
        if (slot.pillCount <= 1) { // Now below or at threshold after dispensing
          // Send low inventory notification
          await notificationService.createNotification(
            device.userId,
            'LOW_INVENTORY',
            'Medication Running Low',
            `Your ${slot.medication.name} is running low. Only ${slot.pillCount - 1} dose(s) remaining.`,
            {
              deviceId: device.deviceId,
              medicationId,
              medicationName: slot.medication.name,
              remainingDoses: slot.pillCount - 1
            }
          );
          
          console.log(`Created low inventory notification for ${slot.medication.name}`);
        }
      }
    } else {
      // If failed, notify the user
      const medication = await db.medications.findUnique({
        where: { id: medicationId }
      });
      
      await notificationService.createNotification(
        device.userId,
        'DISPENSING_ERROR',
        'Medication Dispensing Failed',
        `There was a problem dispensing your ${medication?.name || 'medication'}: ${errorMessage || 'Unknown error'}`,
        {
          deviceId: device.deviceId,
          medicationId,
          slotNumber,
          errorMessage
        }
      );
      
      console.log(`Created dispensing error notification for ${medication?.name || 'medication'}`);
    }
  } catch (error) {
    console.error('Error handling dispensed confirmation:', error);
  }
};