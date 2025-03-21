const Medication = require('../models/Medication');
const Dispenser = require('../models/Dispenser');
const { validationResult } = require('express-validator');

// Get all inventory items
exports.getAllItems = async (req, res) => {
  try {
    const medications = await Medication.find()
      .sort({ name: 1 })
      .populate('dispenser', 'name location');
    
    res.status(200).json({
      success: true,
      count: medications.length,
      data: medications
    });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
};

// Get single inventory item by ID
exports.getItemById = async (req, res) => {
  try {
    const medication = await Medication.findById(req.params.id)
      .populate('dispenser', 'name location');
    
    if (!medication) {
      return res.status(404).json({
        success: false,
        error: 'Medication not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: medication
    });
  } catch (error) {
    console.error('Error fetching medication:', error);
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
};

// Get low stock items
exports.getLowStockItems = async (req, res) => {
  try {
    const medications = await Medication.find({
      $expr: { $lte: ["$currentQuantity", "$lowStockThreshold"] }
    }).populate('dispenser', 'name location');
    
    res.status(200).json({
      success: true,
      count: medications.length,
      data: medications
    });
  } catch (error) {
    console.error('Error fetching low stock items:', error);
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
};

// Get expiring medications
exports.getExpiringItems = async (req, res) => {
  try {
    // Get medications expiring within 30 days
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    
    const medications = await Medication.find({
      expirationDate: { $lte: thirtyDaysFromNow, $gte: new Date() }
    }).sort({ expirationDate: 1 })
      .populate('dispenser', 'name location');
    
    res.status(200).json({
      success: true,
      count: medications.length,
      data: medications
    });
  } catch (error) {
    console.error('Error fetching expiring medications:', error);
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
};

// Add new medication to inventory
exports.addItem = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false, 
      errors: errors.array() 
    });
  }

  try {
    // Check if dispenser exists if dispenser ID is provided
    if (req.body.dispenser) {
      const dispenser = await Dispenser.findById(req.body.dispenser);
      if (!dispenser) {
        return res.status(404).json({
          success: false,
          error: 'Dispenser not found'
        });
      }
    }
    
    const medication = new Medication({
      name: req.body.name,
      genericName: req.body.genericName,
      dosage: req.body.dosage,
      form: req.body.form,
      currentQuantity: req.body.currentQuantity,
      maxQuantity: req.body.maxQuantity,
      lowStockThreshold: req.body.lowStockThreshold || Math.floor(req.body.maxQuantity * 0.2),
      batchNumber: req.body.batchNumber,
      expirationDate: req.body.expirationDate,
      manufacturer: req.body.manufacturer,
      prescriptionRequired: req.body.prescriptionRequired || false,
      dispensingInstructions: req.body.dispensingInstructions,
      storageConditions: req.body.storageConditions,
      dispenser: req.body.dispenser,
      lastRestocked: new Date(),
      notes: req.body.notes
    });
    
    await medication.save();
    
    res.status(201).json({
      success: true,
      data: medication
    });
  } catch (error) {
    console.error('Error adding medication:', error);
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
};

// Update medication details
exports.updateItem = async (req, res) => {
  try {
    let medication = await Medication.findById(req.params.id);
    
    if (!medication) {
      return res.status(404).json({
        success: false,
        error: 'Medication not found'
      });
    }
    
    // Check if dispenser exists if dispenser ID is provided
    if (req.body.dispenser) {
      const dispenser = await Dispenser.findById(req.body.dispenser);
      if (!dispenser) {
        return res.status(404).json({
          success: false,
          error: 'Dispenser not found'
        });
      }
    }
    
    medication = await Medication.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    res.status(200).json({
      success: true,
      data: medication
    });
  } catch (error) {
    console.error('Error updating medication:', error);
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
};

// Update medication quantity only
exports.updateQuantity = async (req, res) => {
  try {
    if (!req.body.quantity && req.body.quantity !== 0) {
      return res.status(400).json({
        success: false,
        error: 'Quantity field is required'
      });
    }
    
    let medication = await Medication.findById(req.params.id);
    
    if (!medication) {
      return res.status(404).json({
        success: false,
        error: 'Medication not found'
      });
    }
    
    // If quantity increased, update lastRestocked date
    const updateFields = { 
      currentQuantity: req.body.quantity
    };
    
    if (req.body.quantity > medication.currentQuantity) {
      updateFields.lastRestocked = new Date();
    }
    
    medication = await Medication.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true }
    );
    
    // Check if medication is now below threshold
    const isLowStock = medication.currentQuantity <= medication.lowStockThreshold;
    
    res.status(200).json({
      success: true,
      data: medication,
      isLowStock
    });
  } catch (error) {
    console.error('Error updating medication quantity:', error);
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
};

// Delete medication from inventory
exports.deleteItem = async (req, res) => {
  try {
    const medication = await Medication.findById(req.params.id);
    
    if (!medication) {
      return res.status(404).json({
        success: false,
        error: 'Medication not found'
      });
    }
    
    await medication.remove();
    
    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    console.error('Error deleting medication:', error);
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
};

// Batch update of inventory (for restocking)
exports.batchUpdate = async (req, res) => {
  try {
    if (!req.body.medications || !Array.isArray(req.body.medications)) {
      return res.status(400).json({
        success: false,
        error: 'Medications array is required'
      });
    }
    
    const results = [];
    const errors = [];
    
    // Process each medication update
    for (const item of req.body.medications) {
      try {
        if (!item.id || !item.quantity) {
          errors.push({ id: item.id, error: 'Invalid item data' });
          continue;
        }
        
        const medication = await Medication.findById(item.id);
        
        if (!medication) {
          errors.push({ id: item.id, error: 'Medication not found' });
          continue;
        }
        
        const updatedMedication = await Medication.findByIdAndUpdate(
          item.id,
          { 
            currentQuantity: item.quantity,
            lastRestocked: new Date(),
            batchNumber: item.batchNumber || medication.batchNumber,
            expirationDate: item.expirationDate || medication.expirationDate
          },
          { new: true }
        );
        
        results.push(updatedMedication);
      } catch (error) {
        errors.push({ id: item.id, error: error.message });
      }
    }
    
    res.status(200).json({
      success: true,
      updated: results.length,
      failed: errors.length,
      data: results,
      errors
    });
  } catch (error) {
    console.error('Error in batch update:', error);
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
};

// Search inventory
exports.searchInventory = async (req, res) => {
  try {
    const query = req.params.query;
    const medications = await Medication.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { genericName: { $regex: query, $options: 'i' } },
        { manufacturer: { $regex: query, $options: 'i' } },
        { batchNumber: { $regex: query, $options: 'i' } }
      ]
    }).populate('dispenser', 'name location');
    
    res.status(200).json({
      success: true,
      count: medications.length,
      data: medications
    });
  } catch (error) {
    console.error('Error searching inventory:', error);
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
};

// Get inventory statistics
exports.getInventoryStats = async (req, res) => {
  try {
    const totalItems = await Medication.countDocuments();
    const lowStockItems = await Medication.countDocuments({
      $expr: { $lte: ["$currentQuantity", "$lowStockThreshold"] }
    });
    
    // Get medications expiring within 30 days
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const expiringItems = await Medication.countDocuments({
      expirationDate: { $lte: thirtyDaysFromNow, $gte: new Date() }
    });
    
    // Get medications by form (pills, liquids, etc.)
    const medicationsByForm = await Medication.aggregate([
      { $group: { _id: "$form", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    // Get average stock level
    const stockStats = await Medication.aggregate([
      { 
        $group: {
          _id: null,
          avgStockPercentage: { 
            $avg: { $multiply: [{ $divide: ["$currentQuantity", "$maxQuantity"] }, 100] } 
          },
          totalCurrentQuantity: { $sum: "$currentQuantity" },
          totalMaxQuantity: { $sum: "$maxQuantity" }
        }
      }
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        totalItems,
        lowStockItems,
        expiringItems,
        medicationsByForm,
        stockLevel: stockStats.length > 0 ? {
          averageStockPercentage: parseFloat(stockStats[0].avgStockPercentage.toFixed(2)),
          totalCurrentQuantity: stockStats[0].totalCurrentQuantity,
          totalMaxQuantity: stockStats[0].totalMaxQuantity
        } : null
      }
    });
  } catch (error) {
    console.error('Error getting inventory stats:', error);
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
};