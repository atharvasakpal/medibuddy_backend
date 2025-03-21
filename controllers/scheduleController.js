import expressAsyncHandler from 'express-async-handler';
import Schedule from '../models/scheduleModel.js';
import PatientMedication from '../models/patientModel.js';
import DispenserDevice from '../models/dispenserDeviceModel.js';
import DispensingLog from '../models/dispenserLogModel.js';
import mongoose from 'mongoose';

// @desc    Get all schedules
// @route   GET /api/schedules
// @access  Admin/Healthcare Provider
const getAllSchedules = expressAsyncHandler(async (req, res) => {
  const schedules = await Schedule.find({})
    .populate('patient', 'firstName lastName')
    .populate('medication', 'name dosage form')
    .populate('dispenser', 'name deviceId');
    
  res.json(schedules);
});

// @desc    Get schedule by ID
// @route   GET /api/schedules/:id
// @access  Admin/Healthcare Provider/Owner
const getScheduleById = expressAsyncHandler(async (req, res) => {
  const schedule = await Schedule.findById(req.params.id)
    .populate('patient', 'firstName lastName')
    .populate('medication', 'name dosage form instructions')
    .populate('dispenser', 'name deviceId compartments');
    
  if (schedule) {
    res.json(schedule);
  } else {
    res.status(404);
    throw new Error('Schedule not found');
  }
});

// @desc    Get schedules by patient
// @route   GET /api/schedules/patient/:patientId
// @access  Admin/Healthcare Provider/Patient
const getSchedulesByPatient = expressAsyncHandler(async (req, res) => {
  const schedules = await Schedule.find({ patient: req.params.patientId })
    .populate('medication', 'name dosage form instructions')
    .populate('dispenser', 'name deviceId');
    
  res.json(schedules);
});

// @desc    Create new medication schedule
// @route   POST /api/schedules
// @access  Healthcare Provider/Admin
const createSchedule = expressAsyncHandler(async (req, res) => {
  const { 
    patient, 
    medication, 
    dispenser, 
    compartmentId,
    scheduleTimes,
    daysOfWeek,
    startDate,
    endDate,
    dosage
  } = req.body;

  // Validate medication exists
  const medicationExists = await PatientMedication.findById(medication);
  if (!medicationExists) {
    res.status(400);
    throw new Error('Medication not found');
  }
  
  // Validate dispenser if provided
  if (dispenser) {
    const dispenserExists = await DispenserDevice.findById(dispenser);
    if (!dispenserExists) {
      res.status(400);
      throw new Error('Dispenser device not found');
    }
    
    // Check compartment if provided
    if (compartmentId) {
      const compartment = dispenserExists.compartments.find(
        c => c.compartmentId === compartmentId
      );
      
      if (!compartment) {
        res.status(400);
        throw new Error('Compartment not found');
      }
      
      // Check if compartment already has medication assigned
      if (compartment.medicationId && 
          compartment.medicationId.toString() !== medication) {
        res.status(400);
        throw new Error('Compartment already assigned to a different medication');
      }
    }
  }
  
  // Create schedule
  const schedule = await Schedule.create({
    patient,
    medication,
    dispenser,
    compartmentId,
    scheduleTimes,
    daysOfWeek: daysOfWeek || [0, 1, 2, 3, 4, 5, 6], // Default to all days if not specified
    startDate: startDate || new Date(),
    endDate,
    dosage: dosage || { tablets: 1 },
    active: true
  });

  if (schedule) {
    // If dispenser and compartment provided, update compartment's medication
    if (dispenser && compartmentId) {
      await DispenserDevice.findOneAndUpdate(
        { _id: dispenser, 'compartments.compartmentId': compartmentId },
        { 
          $set: { 
            'compartments.$.medicationId': medication 
          } 
        }
      );
    }
    
    // Generate initial dispensing logs
    await generateDispensingLogs(schedule);
    
    res.status(201).json(schedule);
  } else {
    res.status(400);
    throw new Error('Invalid schedule data');
  }
});

// @desc    Update medication schedule
// @route   PUT /api/schedules/:id
// @access  Healthcare Provider/Admin
const updateSchedule = expressAsyncHandler(async (req, res) => {
  const schedule = await Schedule.findById(req.params.id);
  
  if (!schedule) {
    res.status(404);
    throw new Error('Schedule not found');
  }
  
  // Check if dispenser or compartment is being changed
  const changingDispenser = req.body.dispenser && 
                          req.body.dispenser !== schedule.dispenser.toString();
  const changingCompartment = req.body.compartmentId && 
                            req.body.compartmentId !== schedule.compartmentId;
  
  // If changing dispenser or compartment, validate new assignment
  if (changingDispenser || changingCompartment) {
    const dispenserId = req.body.dispenser || schedule.dispenser;
    const compartmentId = req.body.compartmentId || schedule.compartmentId;
    
    // Validate dispenser
    const dispenser = await DispenserDevice.findById(dispenserId);
    if (!dispenser) {
      res.status(400);
      throw new Error('Dispenser device not found');
    }
    
    // Check compartment
    const compartment = dispenser.compartments.find(
      c => c.compartmentId === compartmentId
    );
    
    if (!compartment) {
      res.status(400);
      throw new Error('Compartment not found');
    }
    
    // Check if compartment already has medication assigned
    if (compartment.medicationId && 
        compartment.medicationId.toString() !== schedule.medication.toString()) {
      res.status(400);
      throw new Error('Compartment already assigned to a different medication');
    }
    
    // Clear old compartment assignment if changing
    if (schedule.dispenser && schedule.compartmentId) {
      await DispenserDevice.findOneAndUpdate(
        { _id: schedule.dispenser, 'compartments.compartmentId': schedule.compartmentId },
        { $unset: { 'compartments.$.medicationId': '' } }
      );
    }
    
    // Set new compartment assignment
    await DispenserDevice.findOneAndUpdate(
      { _id: dispenserId, 'compartments.compartmentId': compartmentId },
      { $set: { 'compartments.$.medicationId': schedule.medication } }
    );
  }
  
  // Check if schedule timing is being modified
  const timingChanged = req.body.scheduleTimes || 
                       req.body.daysOfWeek || 
                       req.body.startDate || 
                       req.body.endDate;
  
  // Update schedule fields
  schedule.dispenser = req.body.dispenser || schedule.dispenser;
  schedule.compartmentId = req.body.compartmentId || schedule.compartmentId;
  schedule.scheduleTimes = req.body.scheduleTimes || schedule.scheduleTimes;
  schedule.daysOfWeek = req.body.daysOfWeek || schedule.daysOfWeek;
  schedule.startDate = req.body.startDate || schedule.startDate;
  schedule.endDate = req.body.endDate || schedule.endDate;
  schedule.dosage = req.body.dosage || schedule.dosage;
  schedule.active = req.body.active !== undefined ? req.body.active : schedule.active;
  schedule.instructions = req.body.instructions || schedule.instructions;
  
  const updatedSchedule = await schedule.save();
  
  // If timing changed, regenerate future dispensing logs
  if (timingChanged && updatedSchedule.active) {
    // Delete future dispensing logs
    await DispensingLog.deleteMany({
      schedule: updatedSchedule._id,
      scheduledTime: { $gte: new Date() },
      status: 'scheduled'
    });
    
    // Generate new dispensing logs
    await generateDispensingLogs(updatedSchedule);
  }
  
  res.json(updatedSchedule);
});

// @desc    Delete medication schedule
// @route   DELETE /api/schedules/:id
// @access  Healthcare Provider/Admin
const deleteSchedule = expressAsyncHandler(async (req, res) => {
  const schedule = await Schedule.findById(req.params.id);
  
  if (!schedule) {
    res.status(404);
    throw new Error('Schedule not found');
  }
  
  // Clear compartment assignment if exists
  if (schedule.dispenser && schedule.compartmentId) {
    await DispenserDevice.findOneAndUpdate(
      { _id: schedule.dispenser, 'compartments.compartmentId': schedule.compartmentId },
      { $unset: { 'compartments.$.medicationId': '' } }
    );
  }
  
  // Delete future dispensing logs
  await DispensingLog.deleteMany({
    schedule: schedule._id,
    scheduledTime: { $gte: new Date() },
    status: 'scheduled'
  });
  
  // Delete schedule
  await schedule.remove();
  
  res.json({ message: 'Schedule removed' });
});

// @desc    Temporarily pause/resume schedule
// @route   PUT /api/schedules/:id/status
// @access  Healthcare Provider/Admin/Patient
const updateScheduleStatus = expressAsyncHandler(async (req, res) => {
  const { active, reason } = req.body;
  
  if (active === undefined) {
    res.status(400);
    throw new Error('Active status is required');
  }
  
  const schedule = await Schedule.findById(req.params.id);
  
  if (!schedule) {
    res.status(404);
    throw new Error('Schedule not found');
  }
  
  // Update status
  schedule.active = active;
  
  // Add status change to history
  schedule.statusHistory.push({
    status: active ? 'active' : 'paused',
    changedBy: req.user._id,
    reason: reason || '',
    timestamp: new Date()
  });
  
  const updatedSchedule = await schedule.save();
  
  // If activating, generate future dispensing logs
  if (active && !schedule.active) {
    await generateDispensingLogs(updatedSchedule);
  }
  
  // If deactivating, cancel future dispensing logs
  if (!active && schedule.active) {
    await DispensingLog.updateMany(
      {
        schedule: schedule._id,
        scheduledTime: { $gte: new Date() },
        status: 'scheduled'
      },
      {
        $set: { status: 'cancelled', notes: reason || 'Schedule paused' }
      }
    );
  }
  
  res.json(updatedSchedule);
});

// @desc    Validate schedule for conflicts
// @route   POST /api/schedules/validate
// @access  Healthcare Provider/Admin
const validateSchedule = expressAsyncHandler(async (req, res) => {
  const { 
    patient, 
    medication, 
    scheduleTimes, 
    daysOfWeek,
    dispenser,
    compartmentId,
    scheduleId // Include if updating existing schedule
  } = req.body;
  
  const conflicts = [];
  
  // Check for overlapping schedules
  const overlappingFilter = {
    patient,
    medication,
    active: true
  };
  
  // Exclude current schedule if updating
  if (scheduleId) {
    overlappingFilter._id = { $ne: scheduleId };
  }
  
  const overlappingSchedules = await Schedule.find(overlappingFilter);
  
  // Check for time conflicts
  const proposedTimes = scheduleTimes || [];
  const proposedDays = daysOfWeek || [0, 1, 2, 3, 4, 5, 6];
  
  overlappingSchedules.forEach(existing => {
    // Check if days overlap
    const dayOverlap = existing.daysOfWeek.some(day => proposedDays.includes(day));
    
    if (dayOverlap) {
      // Check if times overlap (within 30 minutes)
      existing.scheduleTimes.forEach(existingTime => {
        const [existingHour, existingMinute] = existingTime.split(':').map(Number);
        const existingMinutes = existingHour * 60 + existingMinute;
        
        proposedTimes.forEach(proposedTime => {
          const [proposedHour, proposedMinute] = proposedTime.split(':').map(Number);
          const proposedMinutes = proposedHour * 60 + proposedMinute;
          
          const timeDiff = Math.abs(existingMinutes - proposedMinutes);
          
          // If times are within 30 minutes, flag conflict
          if (timeDiff < 30 || timeDiff > 1410) { // 1440 - 30 = 1410 (checking day wrap)
            conflicts.push({
              type: 'time_conflict',
              schedule: existing._id,
              medication: existing.medication,
              days: existing.daysOfWeek.filter(day => proposedDays.includes(day)),
              existingTime,
              proposedTime
            });
          }
        });
      });
    }
  });
  
  // Check compartment conflicts if dispenser and compartment provided
  if (dispenser && compartmentId) {
    const dispenserDevice = await DispenserDevice.findById(dispenser)
      .populate('compartments.medicationId', 'name');
    
    if (dispenserDevice) {
      const compartment = dispenserDevice.compartments.find(
        c => c.compartmentId === compartmentId
      );
      
      if (compartment) {
        // Check if compartment already assigned to different medication
        if (compartment.medicationId && 
            (!scheduleId || compartment.medicationId.toString() !== medication)) {
          conflicts.push({
            type: 'compartment_conflict',
            dispenser: dispenser,
            compartment: compartmentId,
            currentMedication: compartment.medicationId
          });
        }
      } else {
        conflicts.push({
          type: 'invalid_compartment',
          dispenser: dispenser,
          message: 'Compartment does not exist'
        });
      }
    }
  }
  
  res.json({
    valid: conflicts.length === 0,
    conflicts
  });
});

// Helper function to generate dispensing logs based on schedule
const generateDispensingLogs = async (schedule) => {
  // Only generate logs if schedule is active and has dispenser assigned
  if (!schedule.active || !schedule.dispenser) {
    return;
  }
  
  const now = new Date();
  const endDate = schedule.endDate || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // Default to 30 days
  
  // Generate logs from now until end date
  let currentDate = new Date(now);
  currentDate.setHours(0, 0, 0, 0); // Start at beginning of today
  
  const logs = [];
  
  while (currentDate <= endDate) {
    const dayOfWeek = currentDate.getDay();
    
    // Check if this day is in the schedule
    if (schedule.daysOfWeek.includes(dayOfWeek)) {
      // Generate log for each time on this day
      for (const timeStr of schedule.scheduleTimes) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        
        const scheduledTime = new Date(currentDate);
        scheduledTime.setHours(hours, minutes, 0, 0);
        
        // Only create future logs
        if (scheduledTime > now) {
          logs.push({
            device: schedule.dispenser,
            patient: schedule.patient,
            medication: schedule.medication,
            schedule: schedule._id,
            compartmentId: schedule.compartmentId,
            scheduledTime,
            quantity: schedule.dosage,
            status: 'scheduled'
          });
        }
      }
    }
    
    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  // Batch insert logs if any
  if (logs.length > 0) {
    await DispensingLog.insertMany(logs);
  }
};

export {
  getAllSchedules,
  getScheduleById,
  getSchedulesByPatient,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  updateScheduleStatus,
  validateSchedule
};