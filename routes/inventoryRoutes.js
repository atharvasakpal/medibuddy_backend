const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const { authenticateUser, authorizeAdmin } = require('../middleware/auth');

// Get all inventory items
router.get('/', authenticateUser, inventoryController.getAllItems);

// Get single inventory item by ID
router.get('/:id', authenticateUser, inventoryController.getItemById);

// Get low stock items
router.get('/status/low-stock', authenticateUser, inventoryController.getLowStockItems);

// Get expiring medications
router.get('/status/expiring', authenticateUser, inventoryController.getExpiringItems);

// Add new medication to inventory
router.post('/', authenticateUser, authorizeAdmin, inventoryController.addItem);

// Update medication details
router.put('/:id', authenticateUser, authorizeAdmin, inventoryController.updateItem);

// Update medication quantity only
router.patch('/:id/quantity', authenticateUser, inventoryController.updateQuantity);

// Delete medication from inventory
router.delete('/:id', authenticateUser, authorizeAdmin, inventoryController.deleteItem);

// Batch update of inventory (for restocking)
router.post('/batch-update', authenticateUser, authorizeAdmin, inventoryController.batchUpdate);

// Search inventory
router.get('/search/:query', authenticateUser, inventoryController.searchInventory);

// Get inventory statistics
router.get('/stats/overview', authenticateUser, inventoryController.getInventoryStats);

module.exports = router;