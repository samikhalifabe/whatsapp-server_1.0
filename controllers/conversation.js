const { getAllConversations, getConversationById, updateConversationState } = require('../models/conversation');
const { getMessagesByConversationId } = require('../models/message');
const logger = require('../utils/logger');

// Return all paginated conversations
async function getConversationsPaginated(req, res, next) {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;

    const { conversations, pagination } = await getAllConversations(page, limit);

    res.json({
      conversations,
      pagination
    });
  } catch (error) {
    logger.error('Error retrieving conversations:', error);
    next(error); // Pass error to the error handling middleware
  }
}

// Return a specific conversation with its messages
async function getConversation(req, res, next) {
  try {
    const { id } = req.params;

    const conversation = await getConversationById(id);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const messages = await getMessagesByConversationId(id);

    res.json({
      ...conversation,
      messages
    });
  } catch (error) {
    logger.error(`Error retrieving conversation ${req.params.id}:`, error);
    next(error); // Pass error to the error handling middleware
  }
}

// Update the state of a conversation
async function updateConversationStateHandler(req, res, next) {
  try {
    const { id } = req.params;
    const { state } = req.body;

    if (!id || !state) {
      return res.status(400).json({ error: 'Conversation ID and new state are required' });
    }

    const updatedConversation = await updateConversationState(id, state, 'Manual update via API');

    if (!updatedConversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({
      success: true,
      conversation: updatedConversation
    });
  } catch (error) {
    logger.error(`Error updating conversation ${req.params.id} state:`, error);
    next(error); // Pass error to the error handling middleware
  }
}

module.exports = {
  getConversationsPaginated,
  getConversation, // Renamed from getConversationById to match common controller naming
  updateConversationStateHandler
};
