const mongoose = require('mongoose');
const { Schema } = mongoose;

const MedicationSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    // Modified to only allow tablets
    dosageForm: {
      type: String,
      enum: ['tablet'],
      required: true,
      default: 'tablet'
    },
    strength: {
      type: String,
      required: true
    },
    strengthUnit: {
      type: String,
      required: true,
      enum: ['mg', 'g', 'mcg', 'IU', 'other']
    },
    // Added tablet-specific properties
    shape: {
      type: String,
      enum: ['round', 'oval', 'oblong', 'rectangle', 'square', 'diamond', 'triangle', 'other'],
      required: true
    },
    color: {
      type: String,
      required: true
    },
    size: {
      diameter: Number, // in mm
      thickness: Number // in mm
    },
    scoreLines: {
      type: Number,
      default: 0
    },
    coated: {
      type: Boolean,
      default: false
    },
    instructions: {
      type: String
    },
    sideEffects: [String],
    warnings: [String],
    requiresRefill: {
      type: Boolean,
      default: true
    },
    prescriptionRequired: {
      type: Boolean,
      default: true
    },
    imageUrl: {
      type: String
    },
    manufacturer: {
      type: String
    },
    ndc: {
      type: String
    }, // National Drug Code
    barcode: {
      type: String
    }
  },
  {
    timestamps: true
  }
);

// Indexes for performance
MedicationSchema.index({ name: 1 });
MedicationSchema.index({ barcode: 1 });

const Medication = mongoose.model('Medication', MedicationSchema);

module.exports = Medication;