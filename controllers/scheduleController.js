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

export {
  getAllSchedules,
  getScheduleById,
  createSchedule,
  updateSchedule,
  deleteSchedule
}