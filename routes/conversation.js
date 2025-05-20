const express = require('express');
const router = express.Router();
const conversationController = require('../controllers/conversation');

// Routes for conversations
router.get('/', conversationController.getConversationsPaginated);
router.get('/:id', conversationController.getConversation);
router.patch('/:id/state', conversationController.updateConversationStateHandler);

module.exports = router;
