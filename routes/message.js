const express = require('express');
const router = express.Router();
const messageController = require('../controllers/message');

// Routes for messages
router.get('/vehicle/:vehicleId', messageController.getMessagesForVehicle);
router.get('/contact/:contactId', messageController.getMessagesForContact);

module.exports = router;
