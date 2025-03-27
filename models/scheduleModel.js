import mongoose from 'mongoose';

const scheduleSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    medication: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Medication',
      required: true
    },
    scheduleTimes: {
      type: [String], // Example: ['08:00', '14:00', '20:00']
      required: true
    },
    daysOfWeek: {
      type: [Number], // 0 (Sunday) to 6 (Saturday)
      default: [0, 1, 2, 3, 4, 5, 6]
    },
    startDate: {
      type: Date,
      default: Date.now
    },
    endDate: {
      type: Date,
      default: null
    },
    dosage: {
      tablets: { type: Number, default: 1 },
      unit: { type: String, default: 'tablet' }
    },
    active: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

const Schedule = mongoose.model('Schedule', scheduleSchema);
export default Schedule;
