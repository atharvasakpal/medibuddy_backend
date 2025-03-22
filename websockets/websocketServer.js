import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from '../models/userModel.js';
import DispenserDevice from '../models/dispenserDeviceModel.js';
import DispensingLog from '../models/dispenserLogModel.js';
import PatientMedication from '../models/patientModel.js';
import Medication from '../models/medicationModel.js';

const setupWebSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      methods: ["GET", "POST"]
    }
  });
  
  // Authentication middleware for Socket.io
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication error'));
      }
      
      // Verify the token with Clerk SDK
      // NOTE: You'll need to implement the appropriate
      // verification logic based on how Clerk tokens work
      
      const clerkId = "decoded-clerk-id"; // Replace with actual verification
      
      // Get the user from our database
      const user = await User.findOne({ clerkId });
      if (!user) {
        return next(new Error('User not found'));
      }
      
      // Attach user to socket
      socket.user = user;
      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('Authentication error'));
    }
  });
  
  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user._id}`);
    
    // Join user to their own room for private messages
    socket.join(socket.user._id.toString());
    
    // Join rooms for any devices they own or are assigned to
    if (socket.user.assignedDispensers && socket.user.assignedDispensers.length > 0) {
      socket.user.assignedDispensers.forEach(deviceId => {
        socket.join(`device:${deviceId}`);
      });
    }
    
    // Join role-based rooms (for admin broadcasts, etc.)
    if (socket.user.role) {
      socket.join(`role:${socket.user.role}`);
    }
    
    // Handle medication dispense events from devices
    socket.on('device:dispense', async (data) => {
      try {
        // Verify the device belongs to this user
        const device = await DispenserDevice.findById(data.deviceId);
        if (!device || !socket.user.assignedDispensers.includes(data.deviceId)) {
          return socket.emit('error', { message: 'Unauthorized device access' });
        }
        
        // Create a dispense record
        const dispensing = new DispensingLog({
          medication: data.medicationId,
          patient: socket.user._id,
          device: data.deviceId,
          compartmentId: data.compartmentId,
          quantity: {
            tablets: data.quantity
          },
          dispensedTime: new Date(),
          status: 'dispensed',
          scheduledTime: new Date() // Assuming this was scheduled for now
        });
        
        await dispensing.save();
        
        // Update medication inventory in PatientMedication
        await PatientMedication.findOneAndUpdate(
          { _id: data.medicationId },
          { $inc: { 'inventoryTracking.currentQuantity': -data.quantity } }
        );
        
        // Confirm back to device
        socket.emit('dispense:confirmed', { 
          dispensingId: dispensing._id,
          status: 'success'
        });
        
        // Notify other user sessions
        emitToUser(socket.user._id, 'medication:dispensed', { 
          medicationId: data.medicationId,
          dispensingId: dispensing._id,
          time: new Date()
        });
        
        // Notify caregivers if configured
        const emergencyContacts = socket.user.emergencyContacts || [];
        if (emergencyContacts.length > 0) {
          emergencyContacts.forEach(contact => {
            if (contact.isPrimaryContact) {
              // Assuming you have a way to map contacts to users
              // You might need to adjust this logic based on your actual data model
              emitToUser(contact._id, 'patient:medication:dispensed', {
                patientId: socket.user._id,
                patientName: socket.user.fullName,
                medicationId: data.medicationId,
                dispensingId: dispensing._id,
                time: new Date()
              });
            }
          });
        }
      } catch (error) {
        console.error('Dispense error:', error);
        socket.emit('error', { message: 'Failed to process dispense request' });
      }
    });
    
    // Handle medication confirmation (taken, missed, skipped)
    socket.on('medication:confirm', async (data) => {
      try {
        const { dispensingId, status } = data;
        
        // Update dispensing record
        const dispensing = await DispensingLog.findById(dispensingId);
        
        if (!dispensing || dispensing.patient.toString() !== socket.user._id.toString()) {
          return socket.emit('error', { message: 'Unauthorized access to dispensing record' });
        }
        
        dispensing.status = status;
        dispensing.takenTime = new Date();
        await dispensing.save();
        
        // If status is 'missed' or 'skipped', return medication to inventory
        if (status === 'missed' || status === 'skipped') {
          await PatientMedication.findOneAndUpdate(
            { _id: dispensing.medication },
            { $inc: { 'inventoryTracking.currentQuantity': dispensing.quantity.tablets } }
          );
        }
        
        // Confirm back to user
        socket.emit('medication:confirmed', { 
          dispensingId,
          status: 'success'
        });
        
        // Notify caregivers if needed
        if (status === 'missed') {
          const emergencyContacts = socket.user.emergencyContacts || [];
          if (emergencyContacts.length > 0) {
            emergencyContacts.forEach(contact => {
              if (contact.isPrimaryContact) {
                // Logic to notify caregivers
                // This would need to be adjusted based on your actual data model
                emitToUser(contact._id, 'patient:medication:missed', {
                  patientId: socket.user._id,
                  patientName: socket.user.fullName,
                  medicationId: dispensing.medication,
                  dispensingId,
                  time: new Date()
                });
              }
            });
          }
        }
      } catch (error) {
        console.error('Medication confirmation error:', error);
        socket.emit('error', { message: 'Failed to confirm medication status' });
      }
    });
    
    // Handle device status updates
    socket.on('device:status', async (data) => {
      try {
        const { deviceId, isOnline, batteryLevel, firmwareVersion, needsMaintenance } = data;
        
        // Verify the device belongs to this user
        const device = await DispenserDevice.findById(deviceId);
        if (!device || !socket.user.assignedDispensers.includes(deviceId)) {
          return socket.emit('error', { message: 'Unauthorized device access' });
        }
        
        // Update device status
        const updatedDevice = await DispenserDevice.findByIdAndUpdate(
          deviceId,
          {
            'status.isOnline': isOnline !== undefined ? isOnline : device.status.isOnline,
            'status.batteryLevel': batteryLevel || device.status.batteryLevel,
            'status.firmwareVersion': firmwareVersion || device.status.firmwareVersion,
            'status.needsMaintenance': needsMaintenance !== undefined ? needsMaintenance : device.status.needsMaintenance,
            'status.lastPing': new Date()
          },
          { new: true }
        );
        
        // Broadcast to all sessions for this user
        emitToUser(socket.user._id, 'device:updated', {
          device: updatedDevice
        });
        
        // Alert on critical battery level
        if (batteryLevel && batteryLevel < 20) {
          emitToUser(socket.user._id, 'device:lowBattery', {
            deviceId,
            batteryLevel,
            time: new Date()
          });
          
          // Notify emergency contacts
          const emergencyContacts = socket.user.emergencyContacts || [];
          if (emergencyContacts.length > 0) {
            emergencyContacts.forEach(contact => {
              if (contact.isPrimaryContact) {
                // Logic to notify emergency contacts
                emitToUser(contact._id, 'patient:device:lowBattery', {
                  patientId: socket.user._id,
                  patientName: socket.user.fullName,
                  deviceId,
                  batteryLevel,
                  time: new Date()
                });
              }
            });
          }
        }
        
        // Alert on connectivity issues
        if (isOnline === false) {
          emitToUser(socket.user._id, 'device:offline', {
            deviceId,
            time: new Date()
          });
        }
      } catch (error) {
        console.error('Device status update error:', error);
        socket.emit('error', { message: 'Failed to update device status' });
      }
    });
    
    // Handle medication refill requests from devices
    socket.on('medication:refill', async (data) => {
      try {
        const { medicationId, newQuantity, compartmentId } = data;
        
        // Verify user can access this medication and it's in their dispenser
        const medication = await PatientMedication.findById(medicationId);
        if (!medication || medication.patient.toString() !== socket.user._id.toString()) {
          return socket.emit('error', { message: 'Unauthorized medication access' });
        }
        
        // Update medication quantity
        const updatedMedication = await PatientMedication.findByIdAndUpdate(
          medicationId,
          { 
            'inventoryTracking.currentQuantity': newQuantity,
            'inventoryTracking.lastRefillDate': new Date()
          },
          { new: true }
        );
        
        // Update the dispenser compartment last filled date
        if (compartmentId) {
          // Find user's dispenser with this compartment
          const dispenser = await DispenserDevice.findOne({
            assignedUsers: socket.user._id,
            'compartments.compartmentId': compartmentId
          });
          
          if (dispenser) {
            // Update the compartment's lastFilled date
            await DispenserDevice.updateOne(
              { 
                _id: dispenser._id,
                'compartments.compartmentId': compartmentId 
              },
              { 
                $set: { 
                  'compartments.$.lastFilled': new Date(),
                  'compartments.$.currentQuantity': newQuantity 
                } 
              }
            );
          }
        }
        
        // Confirm to user
        socket.emit('medication:refilled', { 
          medicationId,
          newQuantity,
          status: 'success'
        });
        
        // Broadcast to all user sessions
        emitToUser(socket.user._id, 'medication:updated', {
          medication: updatedMedication
        });
      } catch (error) {
        console.error('Medication refill error:', error);
        socket.emit('error', { message: 'Failed to refill medication' });
      }
    });
    
    // Handle real-time adherence monitoring
    socket.on('adherence:check', async () => {
      try {
        // Calculate adherence stats
        const now = new Date();
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        // Updated to use the correct field names from DispensingLog model
        const dispensings = await DispensingLog.find({
          patient: socket.user._id,
          scheduledTime: { $gte: thirtyDaysAgo },
          status: { $in: ['taken', 'missed', 'skipped'] }
        });
        
        const total = dispensings.length;
        const taken = dispensings.filter(d => d.status === 'taken').length;
        
        const adherenceRate = total > 0 ? (taken / total) * 100 : 0;
        
        socket.emit('adherence:stats', {
          total,
          taken,
          missed: dispensings.filter(d => d.status === 'missed').length,
          skipped: dispensings.filter(d => d.status === 'skipped').length,
          adherenceRate: parseFloat(adherenceRate.toFixed(2)),
          timeframe: '30 days'
        });
        
        // Update all patient medications with the new adherence rate
        await PatientMedication.updateMany(
          { patient: socket.user._id, isActive: true },
          { adherenceRate: parseFloat(adherenceRate.toFixed(2)) }
        );
      } catch (error) {
        console.error('Adherence check error:', error);
        socket.emit('error', { message: 'Failed to retrieve adherence stats' });
      }
    });
    
    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.user._id}`);
    });
  });
  
  // Store io instance for use elsewhere in the app
  global.io = io;
  
  return io;
};

// Helper functions to emit events
export const emitToUser = (userId, event, data) => {
  if (global.io) {
    global.io.to(userId.toString()).emit(event, data);
    return true;
  }
  return false;
};

export const emitToDevice = (deviceId, event, data) => {
  if (global.io) {
    global.io.to(`device:${deviceId}`).emit(event, data);
    return true;
  }
  return false;
};

export const emitToRole = (role, event, data) => {
  if (global.io) {
    global.io.to(`role:${role}`).emit(event, data);
    return true;
  }
  return false;
};

export const emitToAll = (event, data) => {
  if (global.io) {
    global.io.emit(event, data);
    return true;
  }
  return false;
};

export const emitScheduledDispense = async (dispensingId) => {
  try {
    // Find the dispensing record
    const dispensing = await DispensingLog.findById(dispensingId)
      .populate({
        path: 'medication',
        populate: {
          path: 'medication'
        }
      })
      .populate('patient');
      
    if (!dispensing) return false;
    
    // Find all user's connected devices
    const devices = await DispenserDevice.find({ 
      assignedUsers: dispensing.patient._id
    });
    
    // Emit to all devices
    devices.forEach(device => {
      emitToDevice(device._id, 'schedule:dispense', {
        dispensingId: dispensing._id,
        medicationId: dispensing.medication._id,
        medicationName: dispensing.medication.medication.name,
        quantity: dispensing.quantity.tablets,
        scheduledTime: dispensing.scheduledTime
      });
    });
    
    // Emit to user
    emitToUser(dispensing.patient._id, 'medication:scheduled', {
      dispensingId: dispensing._id,
      medicationId: dispensing.medication._id,
      medicationName: dispensing.medication.medication.name,
      quantity: dispensing.quantity.tablets,
      scheduledTime: dispensing.scheduledTime
    });
    
    return true;
  } catch (error) {
    console.error('Failed to emit scheduled dispense:', error);
    return false;
  }
};

export const sendReminder = async (userId, medicationId, message) => {
  try {
    const user = await User.findById(userId);
    const patientMedication = await PatientMedication.findById(medicationId).populate('medication');
    
    if (!user || !patientMedication) return false;
    
    emitToUser(userId, 'reminder', {
      medicationId,
      medicationName: patientMedication.medication.name,
      message,
      time: new Date()
    });
    
    // Also send to emergency contacts if needed
    const emergencyContacts = user.emergencyContacts || [];
    if (emergencyContacts.length > 0) {
      emergencyContacts.forEach(contact => {
        if (contact.isPrimaryContact) {
          // Logic to notify emergency contacts
          // This would need to be adjusted based on your actual data model
          // Assuming you have a way to map contacts to users
          emitToUser(contact._id, 'patient:reminder', {
            patientId: userId,
            patientName: user.fullName,
            medicationId,
            medicationName: patientMedication.medication.name,
            message,
            time: new Date()
          });
        }
      });
    }
    
    return true;
  } catch (error) {
    console.error('Failed to send reminder:', error);
    return false;
  }
};

export default setupWebSocket;