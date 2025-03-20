const mongoose = require('mongoose');
const { Schema } = mongoose;

const DispenserDeviceSchema = new Schema(
  {
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
    assignedUsers: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
    status: {
      isOnline: {
        type: Boolean,
        default: false
      },
      lastPing: {
        type: Date
      },
      batteryLevel: {
        type: Number,
        min: 0,
        max: 100
      },
      firmwareVersion: {
        type: String
      },
      needsMaintenance: {
        type: Boolean,
        default: false
      }
    },
    // Tablet-specific dispenser configuration
    configuration: {
      timezone: {
        type: String,
        default: 'UTC'
      },
      volumeLevel: {
        type: Number,
        default: 70,
        min: 0,
        max: 100
      },
      brightnessLevel: {
        type: Number,
        default: 80,
        min: 0,
        max: 100
      },
      alertDuration: {
        type: Number,
        default: 60 // seconds
      },
      alertRepeatInterval: {
        type: Number,
        default: 300 // seconds
      },
      dispensingMode: {
        type: String,
        enum: ['automatic', 'manual', 'semi-automatic'],
        default: 'automatic'
      },
      wifiNetwork: {
        type: String
      },
      // Added tablet-specific dispenser settings
      tabletVibratorEnabled: {
        type: Boolean,
        default: true
      },
      minTabletSize: {
        type: Number,
        default: 5 // mm diameter
      },
      maxTabletSize: {
        type: Number,
        default: 15 // mm diameter
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
      },
      lastFilled: {
        type: Date
      },
      // Added tablet-specific properties
      tabletSize: {
        type: Number // average size in mm for this compartment
      }
    }],
    location: {
      room: {
        type: String
      },
      address: {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        country: String
      },
      coordinates: {
        latitude: Number,
        longitude: Number
      }
    },
    // Added tablet dispenser hardware specifics
    hardware: {
      numberOfCompartments: {
        type: Number,
        default: 7
      },
      tabletDetectionSensor: {
        type: Boolean,
        default: true
      },
      hasCameraVerification: {
        type: Boolean,
        default: false
      },
      hasWeightSensor: {
        type: Boolean,
        default: true
      },
      maxTabletCapacityPerCompartment: {
        type: Number,
        default: 30
      }
    }
  },
  {
    timestamps: true
  }
);

// Indexes
DispenserDeviceSchema.index({ deviceId: 1 });
DispenserDeviceSchema.index({ ownedBy: 1 });
DispenserDeviceSchema.index({ "status.isOnline": 1 });

const DispenserDevice = mongoose.model('DispenserDevice', DispenserDeviceSchema);

module.exports = DispenserDevice;