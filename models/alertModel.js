import mongoose from 'mongoose';

const alertSchema = new mongoose.Schema(
  {
    alertType: {
      type: String,
      required: true,
      enum: ['missed_dose', 'medication_error', 'general_alert']
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    },
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    medication: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Medication',
      default: null
    },
    message: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['active', 'resolved', 'dismissed'],
      default: 'active'
    }
  },
  {
    timestamps: true
  }
);

const Alert = mongoose.model('Alert', alertSchema);
export default Alert;
