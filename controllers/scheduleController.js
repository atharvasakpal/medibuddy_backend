import expressAsyncHandler from 'express-async-handler';
import Schedule from '../models/scheduleModel.js';

// @desc    Get all schedules
// @route   GET /api/schedules
// @access  Admin/Healthcare Provider
const getAllSchedules = expressAsyncHandler(async (req, res) => {
  const schedules = await Schedule.find({})
    .populate('patient', 'firstName lastName')
    .populate('medication', 'name');
    
  res.json(schedules);
});

// @desc    Get schedule by ID
// @route   GET /api/schedules/:id
// @access  Admin/Healthcare Provider
const getScheduleById = expressAsyncHandler(async (req, res) => {
  const schedule = await Schedule.findById(req.params.id)
    .populate('patient', 'firstName lastName')
    .populate('medication', 'name');
    
  if (schedule) {
    res.json(schedule);
  } else {
    res.status(404);
    throw new Error('Schedule not found');
  }
});

// @desc    Create new medication schedule
// @route   POST /api/schedules
// @access  Healthcare Provider/Admin
const createSchedule = expressAsyncHandler(async (req, res) => {
  const { 
    patient, 
    medication, 
    scheduleTimes,
    daysOfWeek,
    startDate,
    endDate,
    dosage
  } = req.body;

  // Create schedule
  const schedule = await Schedule.create({
    patient,
    medication,
    scheduleTimes,
    daysOfWeek: daysOfWeek || [0, 1, 2, 3, 4, 5, 6], // Default to all days
    startDate: startDate || new Date(),
    endDate,
    dosage: dosage || { tablets: 1 },
    active: true
  });

  res.status(201).json(schedule);
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
  
  // Update schedule fields
  schedule.scheduleTimes = req.body.scheduleTimes || schedule.scheduleTimes;
  schedule.daysOfWeek = req.body.daysOfWeek || schedule.daysOfWeek;
  schedule.startDate = req.body.startDate || schedule.startDate;
  schedule.endDate = req.body.endDate || schedule.endDate;
  schedule.dosage = req.body.dosage || schedule.dosage;
  schedule.active = req.body.active !== undefined ? req.body.active : schedule.active;
  
  const updatedSchedule = await schedule.save();
  
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
  
  // Delete schedule
  await schedule.remove();
  
  res.json({ message: 'Schedule removed' });
});


// @desc    Get today's medication schedule grouped by time period
// @route   GET /api/schedules/today/:patientId
// @access  Private/Patient
const getTodaysMedicationSchedule = expressAsyncHandler(async (req, res) => {
  const patientId = req.params.patientId;
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0-6 (Sunday-Saturday)
  
  // Get all active schedules for this patient
  const schedules = await Schedule.find({
    patient: patientId,
    active: true,
    daysOfWeek: dayOfWeek,
    startDate: { $lte: today },
    $or: [
      { endDate: { $gte: today } },
      { endDate: null }
    ]
  }).populate('medication', 'name strength strengthUnit shape color');
  
  // Group medications by time periods
  const timeGroups = {
    morning: [],
    afternoon: [],
    evening: []
  };
  
  schedules.forEach(schedule => {
    schedule.scheduleTimes.forEach(time => {
      const [hours, minutes] = time.split(':').map(Number);
      
      // Simple logic to categorize times into periods
      if (hours < 12) {
        timeGroups.morning.push({
          scheduleId: schedule._id,
          medication: schedule.medication,
          time,
          dosage: schedule.dosage
        });
      } else if (hours < 17) {
        timeGroups.afternoon.push({
          scheduleId: schedule._id,
          medication: schedule.medication,
          time,
          dosage: schedule.dosage
        });
      } else {
        timeGroups.evening.push({
          scheduleId: schedule._id,
          medication: schedule.medication,
          time,
          dosage: schedule.dosage
        });
      }
    });
  });
  
  // Calculate total counts
  const response = {
    morning: {
      count: timeGroups.morning.length,
      medications: timeGroups.morning
    },
    afternoon: {
      count: timeGroups.afternoon.length,
      medications: timeGroups.afternoon
    },
    evening: {
      count: timeGroups.evening.length,
      medications: timeGroups.evening
    }
  };
  
  res.json(response);
});

// @desc    Calculate adherence rate over specified period
// @route   GET /api/schedules/adherence/:patientId
// @access  Private/Patient
const getAdherenceRate = expressAsyncHandler(async (req, res) => {
  const patientId = req.params.patientId;
  const days = parseInt(req.query.days) || 30; // Default to 30 days
  
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  // Get dispensing logs for this period
  const dispensingLogs = await DispensingLog.find({
    patient: patientId,
    scheduledTime: { $gte: startDate, $lte: endDate }
  });
  
  // Count total scheduled and taken
  const totalScheduled = dispensingLogs.length;
  const totalTaken = dispensingLogs.filter(log => 
    log.status === 'taken' || log.status === 'dispensed'
  ).length;
  
  // Calculate adherence rate
  const adherenceRate = totalScheduled > 0 
    ? Math.round((totalTaken / totalScheduled) * 100) 
    : 100; // Default to 100% if no medications scheduled
  
  res.json({
    adherenceRate,
    period: {
      startDate,
      endDate,
      days
    },
    stats: {
      totalScheduled,
      totalTaken,
      totalMissed: totalScheduled - totalTaken
    }
  });
});

export {
  getAllSchedules,
  getScheduleById,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  getTodaysMedicationSchedule,
  getAdherenceRate
}