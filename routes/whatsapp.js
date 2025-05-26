const express = require('express');
const router = express.Router();
const whatsappController = require('../controllers/whatsapp');

// Define WhatsApp routes
router.get('/status', whatsappController.getStatus);
router.get('/qrcode', whatsappController.getQrCode);
router.post('/send', whatsappController.sendMessage);
router.get('/messages', whatsappController.getRecentMessages); // Get recent messages from WhatsApp
router.get('/update-contacted-vehicles', whatsappController.updateContactedVehicles); // Update vehicle statuses based on WhatsApp chats
router.get('/all-conversations', whatsappController.getAllWhatsAppConversations); // Get all conversations from WhatsApp
router.post('/sync-conversation/:conversationId', whatsappController.syncConversationHistory); // Sync specific conversation
router.post('/sync-all-conversations', whatsappController.syncAllConversationsHistory); // Sync all conversations

module.exports = router;
