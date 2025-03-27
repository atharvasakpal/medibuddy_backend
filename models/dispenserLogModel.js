import mongoose from 'mongoose'
const { Schema } = mongoose;

const DispensingLogSchema = new Schema({
  device: {
    type: Schema.Types.ObjectId,
    ref: 'DispenserDevice',
    required: true
  },
  patient: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  medication: {
    type: Schema.Types.ObjectId,
    ref: 'PatientMedication',
    required: true
  },
  scheduledTime: {
    type: Date,
    required: true
  },
  dispensedTime: {
    type: Date
  },
  status: {
    type: String,
    enum: ['scheduled', 'dispensed', 'missed'],
    default: 'scheduled'
  },
  compartmentId: {
    type: Number,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    default: 1
  },
  notes: {
    type: String
  }
}, {
  timestamps: true
});

// Basic indexes
DispensingLogSchema.index({ device: 1, scheduledTime: 1 });
DispensingLogSchema.index({ patient: 1, status: 1 });

const DispensingLog = mongoose.model('DispensingLog', DispensingLogSchema);

export default DispensingLog;