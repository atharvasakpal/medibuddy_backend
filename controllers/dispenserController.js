
import User from '../models/userModel.js';
import PatientMedication from '../models/patientModel.js';

import expressAsyncHandler from 'express-async-handler';
import DispenserDevice from '../models/dispenserDeviceModel.js';
import DispensingLog from '../models/dispenserLogModel.js';

// @desc    Register new dispenser device
// @route   POST /api/dispensers
// @access  Admin
const registerDispenserDevice = expressAsyncHandler(async (req, res) => {
  const { 
    deviceId, 
    name, 
    ownedBy,
    numberOfCompartments = 7
  } = req.body;

  // Check if dispenser already exists
  const dispenserExists = await DispenserDevice.findOne({ deviceId });

  if (dispenserExists) {
    res.status(400);
    throw new Error('Dispenser already registered');
  }

  // Generate compartments 
  const compartments = Array.from({ length: numberOfCompartments }, (_, i) => ({
    compartmentId: i + 1,
    capacity: 30,
    currentQuantity: 0
  }));

  const dispenser = await DispenserDevice.create({
    deviceId,
    name,
    ownedBy,
    compartments,
    status: {
      isOnline: false,
      batteryLevel: 100
    }
  });

  res.status(201).json(dispenser);
});

// @desc    Get dispenser device by ID
// @route   GET /api/dispensers/:id
// @access  Admin/Owner
const getDispenserDeviceById = expressAsyncHandler(async (req, res) => {
  const dispenser = await DispenserDevice.findById(req.params.id)
    .populate('ownedBy', 'firstName lastName email');
  
  if (!dispenser) {
    res.status(404);
    throw new Error('Dispenser device not found');
  }
  
  res.json(dispenser);
});

// @desc    Create dispensing log entry
// @route   POST /api/dispensers/:id/logs
// @access  System
const createDispensingLog = expressAsyncHandler(async (req, res) => {
  const {
    patient,
    medication,
    scheduledTime,
    compartmentId,
    quantity = 1
  } = req.body;

  // Verify dispenser exists
  const dispenser = await DispenserDevice.findById(req.params.id);
  if (!dispenser) {
    res.status(404);
    throw new Error('Dispenser device not found');
  }

  // Create dispensing log
  const dispensingLog = await DispensingLog.create({
    device: req.params.id,
    patient,
    medication,
    scheduledTime,
    compartmentId,
    quantity,
    status: 'scheduled'
  });

  res.status(201).json(dispensingLog);
});

// @desc    Update dispensing log status
// @route   PUT /api/dispensers/logs/:logId
// @access  System/User
const updateDispensingLogStatus = expressAsyncHandler(async (req, res) => {
  const { 
    status, 
    takenTime,
    notes
  } = req.body;

  const dispensingLog = await DispensingLog.findById(req.params.logId);
  
  if (!dispensingLog) {
    res.status(404);
    throw new Error('Dispensing log not found');
  }
  
  // Update log fields
  dispensingLog.status = status || dispensingLog.status;
  
  if (takenTime) {
    dispensingLog.takenTime = takenTime;
  }
  
  if (notes) {
    dispensingLog.notes = notes;
  }
  
  const updatedLog = await dispensingLog.save();
  
  // If tablets were dispensed, update compartment quantity
  if (status === 'dispensed' && dispensingLog.device) {
    const dispenser = await DispenserDevice.findById(dispensingLog.device);
    
    if (dispenser) {
      const compartmentIndex = dispenser.compartments.findIndex(
        c => c.compartmentId === dispensingLog.compartmentId
      );
      
      if (compartmentIndex !== -1) {
        const tabletsDispensed = dispensingLog.quantity || 1;
        
        dispenser.compartments[compartmentIndex].currentQuantity = 
          Math.max(0, dispenser.compartments[compartmentIndex].currentQuantity - tabletsDispensed);
          
        await dispenser.save();
      }
    }
  }
  
  res.json(updatedLog);
});

// @desc    Get patient's upcoming dispenses
// @route   GET /api/dispensers/upcoming/:patientId
// @access  Admin/Patient
const getUpcomingDispenses = expressAsyncHandler(async (req, res) => {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(23, 59, 59, 999);
  
  const upcomingDispenses = await DispensingLog.find({
    patient: req.params.patientId,
    scheduledTime: { $gte: now, $lte: tomorrow },
    status: 'scheduled'
  })
    .populate('medication', 'name dosage')
    .sort({ scheduledTime: 1 });
  
  res.json(upcomingDispenses);
});

export {
  registerDispenserDevice,
  getDispenserDeviceById,
  createDispensingLog,
  updateDispensingLogStatus,
  getUpcomingDispenses
};