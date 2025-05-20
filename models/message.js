const { supabase } = require('../services/database');
const logger = require('../utils/logger');

// Function to save a message
async function saveMessage(conversationId, body, isFromMe, messageId = null, timestamp = null, userId = null) {
  try {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        body: body,
        is_from_me: isFromMe,
        message_id: messageId,
        timestamp: timestamp || new Date().toISOString(),
        user_id: userId
      })
      .select();

    if (error) {
      logger.error('Error storing message:', error);
      return null;
    }

    return data[0];
  } catch (error) {
    logger.error('Exception storing message:', error);
    throw error;
  }
}

// Function to retrieve messages for a conversation ID
async function getMessagesByConversationId(conversationId) {
  logger.info('Retrieving messages for conversation:', conversationId);
  try {
    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: true });

    if (error) {
      logger.error('Error retrieving messages:', error);
      throw new Error('Error retrieving messages');
    }

    return messages || [];
  } catch (error) {
    logger.error('Exception retrieving messages:', error);
    throw error;
  }
}

module.exports = {
  saveMessage,
  getMessagesByConversationId,
};
