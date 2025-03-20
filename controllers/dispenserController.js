import expressAsyncHandler from 'express-async-handler';
import DispenserDevice from '../models/dispenserDeviceModel.js';
import DispensingLog from '../models/dispenserLogModel.js';
import User from '../models/userModel.js';
import PatientMedication from '../models/patientModel.js';

// @desc    Get all dispenser devices
// @route   GET /api/dispensers
// @access  Admin
const getDispenserDevices = expressAsyncHandler(async (req, res) => {
  const dispensers = await DispenserDevice.find({})
    .populate('ownedBy', 'firstName lastName email')
    .populate('assignedUsers', 'firstName lastName email');
  res.json(dispensers);
});

// @desc    Get dispenser device by ID
// @route   GET /api/dispensers/:id
// @access  Admin/Owner
const getDispenserDeviceById = expressAsyncHandler(async (req, res) => {
  const dispenser = await DispenserDevice.findById(req.params.id)
    .populate('ownedBy', 'firstName lastName email')
    .populate('assignedUsers', 'firstName lastName email')
    .populate('compartments.medicationId', 'name dosage schedule');
  
  if (dispenser) {
    res.json(dispenser);
  } else {
    res.status(404);
    throw new Error('Dispenser device not found');
  }
});

// @desc    Get dispenser devices by owner
// @route   GET /api/dispensers/owner/:userId
// @access  Admin/Owner
const getDispenserDevicesByOwner = expressAsyncHandler(async (req, res) => {
  const dispensers = await DispenserDevice.find({ ownedBy: req.params.userId })
    .populate('assignedUsers', 'firstName lastName email');
  
  if (dispensers) {
    res.json(dispensers);
  } else {
    res.json([]);
  }
});

// @desc    Get dispenser devices by assigned user
// @route   GET /api/dispensers/assigned/:userId
// @access  Admin/Owner/Assigned User
const getDispenserDevicesByAssignedUser = expressAsyncHandler(async (req, res) => {
  const dispensers = await DispenserDevice.find({ assignedUsers: req.params.userId })
    .populate('ownedBy', 'firstName lastName email');
  
  if (dispensers) {
    res.json(dispensers);
  } else {
    res.json([]);
  }
});

// @desc    Register new dispenser device
// @route   POST /api/dispensers
// @access  Admin
const registerDispenserDevice = expressAsyncHandler(async (req, res) => {
  const { 
    deviceId, 
    name, 
    ownedBy,
    assignedUsers,
    numberOfCompartments,
    hardware
  } = req.body;

  // Check if dispenser already exists
  const dispenserExists = await DispenserDevice.findOne({ deviceId });

  if (dispenserExists) {
    res.status(400);
    throw new Error('Dispenser already registered');
  }

  // Generate compartments based on number specified
  const compartments = [];
  const compartmentCount = hardware?.numberOfCompartments || 7;
  
  for (let i = 0; i < compartmentCount; i++) {
    compartments.push({
      compartmentId: i + 1,
      capacity: hardware?.maxTabletCapacityPerCompartment || 30,
      currentQuantity: 0
    });
  }

  const dispenser = await DispenserDevice.create({
    deviceId,
    name,
    ownedBy,
    assignedUsers: assignedUsers || [],
    compartments,
    hardware: {
      ...hardware,
      numberOfCompartments: compartmentCount
    },
    status: {
      isOnline: false,
      lastPing: new Date(),
      batteryLevel: 100,
      needsMaintenance: false
    }
  });

  if (dispenser) {
    res.status(201).json(dispenser);
  } else {
    res.status(400);
    throw new Error('Invalid dispenser data');
  }
});

// @desc    Update dispenser device
// @route   PUT /api/dispensers/:id
// @access  Admin/Owner
const updateDispenserDevice = expressAsyncHandler(async (req, res) => {
  const dispenser = await DispenserDevice.findById(req.params.id);
  
  if (dispenser) {
    // Update basic info
    dispenser.name = req.body.name || dispenser.name;
    
    // Update assignedUsers if provided
    if (req.body.assignedUsers) {
      dispenser.assignedUsers = req.body.assignedUsers;
    }
    
    // Update configuration if provided
    if (req.body.configuration) {
      dispenser.configuration = {
        ...dispenser.configuration,
        ...req.body.configuration
      };
    }
    
    // Update location if provided
    if (req.body.location) {
      dispenser.location = {
        ...dispenser.location,
        ...req.body.location
      };
    }
    
    // Update hardware settings if provided (admin only)
    if (req.body.hardware && req.user.role === 'admin') {
      dispenser.hardware = {
        ...dispenser.hardware,
        ...req.body.hardware
      };
    }
    
    const updatedDispenser = await dispenser.save();
    res.json(updatedDispenser);
  } else {
    res.status(404);
    throw new Error('Dispenser device not found');
  }
});

// @desc    Update dispenser status
// @route   PUT /api/dispensers/:id/status
// @access  Admin/System
const updateDispenserStatus = expressAsyncHandler(async (req, res) => {
  const dispenser = await DispenserDevice.findById(req.params.id);
  
  if (dispenser) {
    // Update status fields
    dispenser.status = {
      ...dispenser.status,
      ...req.body.status,
      lastPing: new Date()
    };
    
    const updatedDispenser = await dispenser.save();
    res.json(updatedDispenser);
  } else {
    res.status(404);
    throw new Error('Dispenser device not found');
  }
});

// @desc    Update dispenser compartment
// @route   PUT /api/dispensers/:id/compartment/:compartmentId
// @access  Admin/Owner/Healthcare Provider
const updateDispenserCompartment = expressAsyncHandler(async (req, res) => {
  const dispenser = await DispenserDevice.findById(req.params.id);
  
  if (!dispenser) {
    res.status(404);
    throw new Error('Dispenser device not found');
  }
  
  const compartmentIndex = dispenser.compartments.findIndex(
    c => c.compartmentId === parseInt(req.params.compartmentId)
  );
  
  if (compartmentIndex === -1) {
    res.status(404);
    throw new Error('Compartment not found');
  }
  
  // Update compartment fields
  if (req.body.medicationId) {
    // Verify medication exists
    const medicationExists = await PatientMedication.findById(req.body.medicationId);
    if (!medicationExists) {
      res.status(400);
      throw new Error('Medication not found');
    }
    dispenser.compartments[compartmentIndex].medicationId = req.body.medicationId;
  }
  
  if (req.body.currentQuantity !== undefined) {
    dispenser.compartments[compartmentIndex].currentQuantity = req.body.currentQuantity;
    
    // If refilling, update lastFilled date
    if (req.body.currentQuantity > dispenser.compartments[compartmentIndex].currentQuantity) {
      dispenser.compartments[compartmentIndex].lastFilled = new Date();
    }
  }
  
  if (req.body.tabletSize) {
    dispenser.compartments[compartmentIndex].tabletSize = req.body.tabletSize;
  }
  
  const updatedDispenser = await dispenser.save();
  res.json(updatedDispenser.compartments[compartmentIndex]);
});

// @desc    Assign user to dispenser
// @route   PUT /api/dispensers/:id/assign
// @access  Admin/Owner
const assignUserToDispenser = expressAsyncHandler(async (req, res) => {
  const dispenser = await DispenserDevice.findById(req.params.id);
  const { userId } = req.body;
  
  if (!dispenser) {
    res.status(404);
    throw new Error('Dispenser device not found');
  }
  
  const user = await User.findById(userId);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }
  
  // Check if user is already assigned
  if (dispenser.assignedUsers.includes(userId)) {
    res.status(400);
    throw new Error('User already assigned to this dispenser');
  }
  
  dispenser.assignedUsers.push(userId);
  
  const updatedDispenser = await dispenser.save();
  res.json(updatedDispenser);
});

// @desc    Remove user from dispenser
// @route   PUT /api/dispensers/:id/unassign
// @access  Admin/Owner
const removeUserFromDispenser = expressAsyncHandler(async (req, res) => {
  const dispenser = await DispenserDevice.findById(req.params.id);
  const { userId } = req.body;
  
  if (!dispenser) {
    res.status(404);
    throw new Error('Dispenser device not found');
  }
  
  // Remove user from assignedUsers
  dispenser.assignedUsers = dispenser.assignedUsers.filter(
    id => id.toString() !== userId
  );
  
  const updatedDispenser = await dispenser.save();
  res.json(updatedDispenser);
});

// @desc    Get dispenser logs
// @route   GET /api/dispensers/:id/logs
// @access  Admin/Owner/Assigned User/Healthcare Provider
const getDispenserLogs = expressAsyncHandler(async (req, res) => {
  const { startDate, endDate, status } = req.query;
  
  // Build filter
  const filter = { device: req.params.id };
  
  if (startDate && endDate) {
    filter.scheduledTime = { 
      $gte: new Date(startDate), 
      $lte: new Date(endDate) 
    };
  } else if (startDate) {
    filter.scheduledTime = { $gte: new Date(startDate) };
  } else if (endDate) {
    filter.scheduledTime = { $lte: new Date(endDate) };
  }
  
  if (status) {
    filter.status = status;
  }
  
  const logs = await DispensingLog.find(filter)
    .populate('medication', 'name dosage form')
    .populate('patient', 'firstName lastName')
    .sort({ scheduledTime: -1 });
  
  res.json(logs);
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
    quantity,
    verificationMethod
  } = req.body;

  // Verify dispenser exists
  const dispenser = await DispenserDevice.findById(req.params.id);
  if (!dispenser) {
    res.status(404);
    throw new Error('Dispenser device not found');
  }
  
  // Verify patient exists
  const patientExists = await User.findById(patient);
  if (!patientExists) {
    res.status(400);
    throw new Error('Patient not found');
  }
  
  // Verify medication exists
  const medicationExists = await PatientMedication.findById(medication);
  if (!medicationExists) {
    res.status(400);
    throw new Error('Medication not found');
  }
  
  // Create dispensing log
  const dispensingLog = await DispensingLog.create({
    device: req.params.id,
    patient,
    medication,
    scheduledTime,
    compartmentId,
    quantity: {
      tablets: quantity || 1
    },
    verificationMethod: verificationMethod || 'none',
    status: 'scheduled'
  });

  if (dispensingLog) {
    res.status(201).json(dispensingLog);
  } else {
    res.status(400);
    throw new Error('Invalid dispensing log data');
  }
});

// @desc    Update dispensing log status
// @route   PUT /api/dispensers/logs/:logId
// @access  System/User
const updateDispensingLogStatus = expressAsyncHandler(async (req, res) => {
  const { 
    status, 
    takenTime, 
    dispensedTime, 
    notes, 
    verificationSuccessful,
    actualTabletDispensed
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
  
  if (dispensedTime) {
    dispensingLog.dispensedTime = dispensedTime;
  }
  
  if (notes) {
    dispensingLog.notes = notes;
  }
  
  if (verificationSuccessful !== undefined) {
    dispensingLog.verificationSuccessful = verificationSuccessful;
  }
  
  if (actualTabletDispensed !== undefined) {
    dispensingLog.quantity.actualTabletDispensed = actualTabletDispensed;
  }
  
  // Add alert info if provided
  if (req.body.alert) {
    dispensingLog.alertsSent.push({
      alertType: req.body.alert.alertType,
      sentAt: req.body.alert.sentAt || new Date(),
      sentTo: req.body.alert.sentTo,
      method: req.body.alert.method
    });
  }
  
  const updatedLog = await dispensingLog.save();
  
  // If tablets were dispensed, update compartment quantity
  if (status === 'dispensed' && dispensingLog.device && dispensingLog.compartmentId) {
    const dispenser = await DispenserDevice.findById(dispensingLog.device);
    
    if (dispenser) {
      const compartmentIndex = dispenser.compartments.findIndex(
        c => c.compartmentId === dispensingLog.compartmentId
      );
      
      if (compartmentIndex !== -1) {
        const tabletsDispensed = dispensingLog.quantity.actualTabletDispensed || 
                                dispensingLog.quantity.tablets || 1;
                                
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
// @access  Admin/Owner/Healthcare Provider/Patient
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
    .populate('device', 'name location')
    .populate('medication', 'name dosage form')
    .sort({ scheduledTime: 1 });
  
  res.json(upcomingDispenses);
});

// @desc    Generate medication adherence report
// @route   GET /api/dispensers/adherence/:patientId
// @access  Admin/Healthcare Provider/Patient
const getAdherenceReport = expressAsyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default to last 30 days
  const end = endDate ? new Date(endDate) : new Date();
  
  const logs = await DispensingLog.find({
    patient: req.params.patientId,
    scheduledTime: { $gte: start, $lte: end }
  });
  
  const total = logs.length;
  const taken = logs.filter(log => log.status === 'taken').length;
  const missed = logs.filter(log => log.status === 'missed').length;
  const skipped = logs.filter(log => log.status === 'skipped').length;
  
  // Calculate adherence percentage
  const adherenceRate = total > 0 ? (taken / total) * 100 : 0;
  
  // Generate medication-specific adherence
  const medicationsMap = {};
  logs.forEach(log => {
    const medId = log.medication.toString();
    if (!medicationsMap[medId]) {
      medicationsMap[medId] = { total: 0, taken: 0, name: '' };
    }
    
    medicationsMap[medId].total += 1;
    if (log.status === 'taken') {
      medicationsMap[medId].taken += 1;
    }
  });
  
  // Fetch medication names
  const medicationIds = Object.keys(medicationsMap);
  const medications = await PatientMedication.find({ _id: { $in: medicationIds } });
  
  medications.forEach(med => {
    if (medicationsMap[med._id.toString()]) {
      medicationsMap[med._id.toString()].name = med.name;
    }
  });
  
  // Calculate adherence by medication
  const medicationAdherence = Object.values(medicationsMap).map(med => ({
    name: med.name,
    adherenceRate: med.total > 0 ? (med.taken / med.total) * 100 : 0,
    total: med.total,
    taken: med.taken
  }));
  
  // Generate day-by-day adherence for trend analysis
  const dailyAdherence = {};
  logs.forEach(log => {
    const day = log.scheduledTime.toISOString().split('T')[0];
    if (!dailyAdherence[day]) {
      dailyAdherence[day] = { total: 0, taken: 0 };
    }
    
    dailyAdherence[day].total += 1;
    if (log.status === 'taken') {
      dailyAdherence[day].taken += 1;
    }
  });
  
  const adherenceTrend = Object.entries(dailyAdherence).map(([date, data]) => ({
    date,
    adherenceRate: data.total > 0 ? (data.taken / data.total) * 100 : 0,
    total: data.total,
    taken: data.taken
  })).sort((a, b) => new Date(a.date) - new Date(b.date));
  
  const report = {
    patient: req.params.patientId,
    period: { startDate: start, endDate: end },
    summary: {
      total,
      taken,
      missed,
      skipped,
      adherenceRate: parseFloat(adherenceRate.toFixed(2))
    },
    medicationAdherence,
    adherenceTrend
  };
  
  res.json(report);
});

export {
  getDispenserDevices,
  getDispenserDeviceById,
  getDispenserDevicesByOwner,
  getDispenserDevicesByAssignedUser,
  registerDispenserDevice,
  updateDispenserDevice,
  updateDispenserStatus,
  updateDispenserCompartment,
  assignUserToDispenser,
  removeUserFromDispenser,
  getDispenserLogs,
  createDispensingLog,
  updateDispensingLogStatus,
  getUpcomingDispenses,
  getAdherenceReport
};