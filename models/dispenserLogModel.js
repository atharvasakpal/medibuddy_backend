const mongoose = require('mongoose');
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
  takenTime: {
    type: Date
  },
  status: {
    type: String,
    enum: ['scheduled', 'dispensed', 'taken', 'missed', 'skipped'],
    default: 'scheduled'
  },
  compartmentId: {
    type: Number,
    required: true
  },
  // Tablet-specific fields
  quantity: {
    tablets: {
      type: Number,
      required: true,
      default: 1
    },
    actualTabletDispensed: {
      type: Number  // For verification
    }
  },
  verificationMethod: {
    type: String,
    enum: ['none', 'weight', 'camera', 'manual'],
    default: 'none'
  },
  verificationSuccessful: {
    type: Boolean
  },
  tabletProperties: {
    size: Number,    // mm
    weight: Number   // mg
  },
  notes: {
    type: String
  },
  alertsSent: [{
    alertType: {
      type: String,
      enum: ['initial', 'reminder', 'missed', 'emergency_contact']
    },
    sentAt: {
      type: Date
    },
    sentTo: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    method: {
      type: String,
      enum: ['app', 'sms', 'email', 'voice']
    }
  }]
}, {
  timestamps: true
});

// Indexes
DispensingLogSchema.index({ device: 1, scheduledTime: 1 });
DispensingLogSchema.index({ patient: 1, status: 1 });
DispensingLogSchema.index({ medication: 1 });
DispensingLogSchema.index({ scheduledTime: 1, status: 1 });

const DispensingLog = mongoose.model('DispensingLog', DispensingLogSchema);

module.exports = DispensingLog;