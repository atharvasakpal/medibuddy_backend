import mongoose from "mongoose";
const { Schema } = mongoose;

const DispenserDeviceSchema = new Schema({
  deviceId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  ownedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    isOnline: {
      type: Boolean,
      default: false
    },
    batteryLevel: {
      type: Number,
      min: 0,
      max: 100
    }
  },
  compartments: [{
    compartmentId: {
      type: Number,
      required: true
    },
    medicationId: {
      type: Schema.Types.ObjectId,
      ref: 'PatientMedication'
    },
    currentQuantity: {
      type: Number,
      default: 0
    },
    capacity: {
      type: Number,
      required: true
    }
  }],
  configuration: {
    dispensingMode: {
      type: String,
      enum: ['automatic', 'manual'],
      default: 'automatic'
    }
  }
}, {
  timestamps: true
});

// Basic indexes
DispenserDeviceSchema.index({ deviceId: 1 });
DispenserDeviceSchema.index({ ownedBy: 1 });

const DispenserDevice = mongoose.model('DispenserDevice', DispenserDeviceSchema);

export default DispenserDevice;