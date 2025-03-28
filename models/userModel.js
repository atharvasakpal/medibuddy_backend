import mongoose from 'mongoose';
const { Schema } = mongoose;

const UserSchema = new Schema(
  {
    // Clerk auth info
    clerkId: { 
      type: String, 
      required: true, 
      unique: true 
    },
    email: { 
      type: String, 
      required: true, 
      unique: true,
      lowercase: true,
      trim: true
    },
    firstName: { 
      type: String, 
      required: true 
    },
    lastName: { 
      type: String, 
      required: true 
    },
    
    // Role information
    role: { 
      type: String, 
      enum: ['patient', 'caregiver', 'healthcare_provider', 'admin'],
      required: true,
      default: 'patient'
    },
    
    // Personal info
    dateOfBirth: { 
      type: Date 
    },
    phoneNumber: { 
      type: String 
    },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String
    },
    
    // Emergency contacts
    emergencyContacts: [
      {
        name: { type: String, required: true },
        relationship: { type: String, required: true },
        phoneNumber: { type: String, required: true },
        email: String,
        isPrimaryContact: { type: Boolean, default: false }
      }
    ],
    
    // User preferences
    preferences: {
      notificationMethods: {
        type: [String],
        enum: ['app', 'sms', 'email', 'voice'],
        default: ['app']
      },
      reminderFrequency: {
        type: String,
        enum: ['once', 'twice', 'thrice'],
        default: 'once'
      },
      medicationTimePreference: [String]
    },
    
    // Connected dispenser devices
    assignedDispensers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DispenserDevice'
    }],
    
    // Healthcare provider specific fields
    specialization: String,
    licenseNumber: String,
    
    // System fields
    isActive: { 
      type: Boolean, 
      default: true 
    },
    lastLogin: Date
  },
  {
    // Automatically add createdAt and updatedAt fields
    timestamps: true
  }
);

// REMOVED EXPLICIT INDEXES
// When you use `unique: true`, Mongoose automatically creates an index
// So these explicit indexes were causing the duplicate warning

// Virtual for full name
UserSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Method to check if user is a healthcare professional
UserSchema.methods.isHealthcareProfessional = function() {
  return this.role === 'healthcare_provider';
};

const User = mongoose.model('User', UserSchema);

export default User