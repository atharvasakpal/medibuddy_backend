import { Server } from 'socket.io';
import { protect } from '../middlewares/authMiddleware.js';
import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';
import Device from '../models/device.model.js';
import Dispensing from '../models/dispensing.model.js';
import Medication from '../models/medication.model.js';

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
    if (socket.user.roles) {
      socket.user.roles.forEach(role => {
        socket.join(`role:${role}`);
      });
    }
    
    // Handle medication dispense events from devices
    socket.on('device:dispense', async (data) => {
      try {
        // Verify the device belongs to this user
        const device = await Device.findById(data.deviceId);
        if (!device || !socket.user.assignedDispensers.includes(data.deviceId)) {
          return socket.emit('error', { message: 'Unauthorized device access' });
        }
        
        // Create a dispense record
        const dispensing = new Dispensing({
          medication: data.medicationId,
          user: socket.user._id,
          device: data.deviceId,
          quantity: data.quantity,
          dispensedTime: new Date(),
          status: 'dispensed'
        });
        
        await dispensing.save();
        
        // Update medication inventory
        await Medication.findByIdAndUpdate(
          data.medicationId,
          { $inc: { remainingQuantity: -data.quantity } }
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
        if (socket.user.caregivers && socket.user.caregivers.length > 0) {
          socket.user.caregivers.forEach(caregiverId => {
            emitToUser(caregiverId, 'patient:medication:dispensed', {
              patientId: socket.user._id,
              patientName: socket.user.name,
              medicationId: data.medicationId,
              dispensingId: dispensing._id,
              time: new Date()
            });
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
        const dispensing = await Dispensing.findById(dispensingId);
        
        if (!dispensing || dispensing.user.toString() !== socket.user._id.toString()) {
          return socket.emit('error', { message: 'Unauthorized access to dispensing record' });
        }
        
        dispensing.status = status;
        dispensing.confirmedTime = new Date();
        await dispensing.save();
        
        // If status is 'missed' or 'skipped', return medication to inventory
        if (status === 'missed' || status === 'skipped') {
          await Medication.findByIdAndUpdate(
            dispensing.medication,
            { $inc: { remainingQuantity: dispensing.quantity } }
          );
        }
        
        // Confirm back to user
        socket.emit('medication:confirmed', { 
          dispensingId,
          status: 'success'
        });
        
        // Notify caregivers if needed
        if (status === 'missed' && socket.user.caregivers && socket.user.caregivers.length > 0) {
          socket.user.caregivers.forEach(caregiverId => {
            emitToUser(caregiverId, 'patient:medication:missed', {
              patientId: socket.user._id,
              patientName: socket.user.name,
              medicationId: dispensing.medication,
              dispensingId,
              time: new Date()
            });
          });
        }
      } catch (error) {
        console.error('Medication confirmation error:', error);
        socket.emit('error', { message: 'Failed to confirm medication status' });
      }
    });
    
    // Handle device status updates
    socket.on('device:status', async (data) => {
      try {
        const { deviceId, status, batteryLevel, connectivity, error } = data;
        
        // Verify the device belongs to this user
        const device = await Device.findById(deviceId);
        if (!device || !socket.user.assignedDispensers.includes(deviceId)) {
          return socket.emit('error', { message: 'Unauthorized device access' });
        }
        
        // Update device status
        const updatedDevice = await Device.findByIdAndUpdate(
          deviceId,
          {
            status: status || device.status,
            batteryLevel: batteryLevel || device.batteryLevel,
            connectivity: connectivity || device.connectivity,
            lastConnected: new Date(),
            ...(error && { error: {
              code: error.code,
              message: error.message,
              timestamp: new Date()
            }})
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
          
          // Notify caregivers too
          if (socket.user.caregivers && socket.user.caregivers.length > 0) {
            socket.user.caregivers.forEach(caregiverId => {
              emitToUser(caregiverId, 'patient:device:lowBattery', {
                patientId: socket.user._id,
                patientName: socket.user.name,
                deviceId,
                batteryLevel,
                time: new Date()
              });
            });
          }
        }
        
        // Alert on connectivity issues
        if (connectivity === 'offline') {
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
        const { medicationId, newQuantity } = data;
        
        // Verify user can access this medication
        const medication = await Medication.findById(medicationId);
        if (!medication || medication.user.toString() !== socket.user._id.toString()) {
          return socket.emit('error', { message: 'Unauthorized medication access' });
        }
        
        // Update medication quantity
        const updatedMedication = await Medication.findByIdAndUpdate(
          medicationId,
          { 
            remainingQuantity: newQuantity,
            lastRefillDate: new Date()
          },
          { new: true }
        );
        
        // Log the refill event
        // You might want to create a separate model for tracking refills
        
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
        
        const dispensings = await Dispensing.find({
          user: socket.user._id,
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
    const dispensing = await Dispensing.findById(dispensingId)
      .populate('medication')
      .populate('user');
      
    if (!dispensing) return false;
    
    // Find all user's connected devices
    const devices = await Device.find({ 
      _id: { $in: dispensing.user.assignedDispensers }
    });
    
    // Emit to all devices
    devices.forEach(device => {
      emitToDevice(device._id, 'schedule:dispense', {
        dispensingId: dispensing._id,
        medicationId: dispensing.medication._id,
        medicationName: dispensing.medication.name,
        quantity: dispensing.quantity,
        scheduledTime: dispensing.scheduledTime
      });
    });
    
    // Emit to user
    emitToUser(dispensing.user._id, 'medication:scheduled', {
      dispensingId: dispensing._id,
      medicationId: dispensing.medication._id,
      medicationName: dispensing.medication.name,
      quantity: dispensing.quantity,
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
    const medication = await Medication.findById(medicationId);
    
    if (!user || !medication) return false;
    
    emitToUser(userId, 'reminder', {
      medicationId,
      medicationName: medication.name,
      message,
      time: new Date()
    });
    
    // Also send to caregivers if needed
    if (user.caregivers && user.caregivers.length > 0) {
      user.caregivers.forEach(caregiverId => {
        emitToUser(caregiverId, 'patient:reminder', {
          patientId: userId,
          patientName: user.name,
          medicationId,
          medicationName: medication.name,
          message,
          time: new Date()
        });
      });
    }
    
    return true;
  } catch (error) {
    console.error('Failed to send reminder:', error);
    return false;
  }
};

export default setupWebSocket;