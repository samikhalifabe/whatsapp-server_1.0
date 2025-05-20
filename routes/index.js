const express = require('express');
const router = express.Router();

// Import the different routers
const whatsappRoutes = require('./whatsapp');
const conversationRoutes = require('./conversation');
const messageRoutes = require('./message');
const aiRoutes = require('./ai');

// Define the routes
router.use('/whatsapp', whatsappRoutes);
router.use('/conversations', conversationRoutes);
router.use('/messages', messageRoutes);
router.use('/ai', aiRoutes);

module.exports = router;
