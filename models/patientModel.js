import mongoose from 'mongoose';
const { Schema } = mongoose;

const PatientMedicationSchema = new Schema(
  {
    patient: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    medication: {
      type: Schema.Types.ObjectId,
      ref: 'Medication',
      required: true
    },
    prescribedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    // Updated for tablets specifically
    dosage: {
      // For tablets, this is the number of tablets per dose
      amount: {
        type: Number,
        required: true,
        min: 0.5,  // Allow for half tablets
        default: 1
      },
      unit: {
        type: String,
        required: true,
        enum: ['tablet', 'half-tablet'],
        default: 'tablet'
      },
      frequency: {
        type: String,
        required: true,
        enum: ['daily', 'twice-daily', 'three-times-daily', 'four-times-daily', 'weekly', 'as-needed']
      },
      timesPerDay: {
        type: Number,
        required: true
      },
      specificTimes: [String]
    },
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date
    },
    isActive: {
      type: Boolean,
      default: true
    },
    takeWithFood: {
      type: Boolean,
      default: false
    },
    takeWithWater: {
      type: Boolean,
      default: true
    },
    canBeCrushed: {
      type: Boolean,
      default: false
    },
    specialInstructions: {
      type: String
    },
    // Tablet inventory specifics
    inventoryTracking: {
      currentQuantity: {
        type: Number,
        default: 0
      },
      refillAt: {
        type: Number
      },
      lastRefillDate: {
        type: Date
      },
      tabletsPerRefill: {
        type: Number
      },
      exactTabletCount: {
        type: Boolean,
        default: true  // Whether the dispenser can count exact tablets
      }
    },
    dispenserCompartment: {
      type: Number
    },
    adherenceRate: {
      type: Number,
      min: 0,
      max: 100
    }
  },
  {
    timestamps: true
  }
);

// Indexes
PatientMedicationSchema.index({ patient: 1, medication: 1 });
PatientMedicationSchema.index({ patient: 1, isActive: 1 });

const PatientMedication = mongoose.model('PatientMedication', PatientMedicationSchema);

module.exports = PatientMedication;