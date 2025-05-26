const { supabase } = require('../services/database');
const logger = require('../utils/logger');

// Function to save a message
async function saveMessage(conversationId, body, isFromMe, messageId = null, timestamp = null, userId = null) {
  try {
    logger.info(`[DB] 💾 Tentative sauvegarde message: conversationId=${conversationId}, body="${body}", isFromMe=${isFromMe}, messageId=${messageId}`);
    
    const messageData = {
      conversation_id: conversationId,
      body: body,
      is_from_me: isFromMe,
      message_id: messageId,
      timestamp: timestamp || new Date().toISOString(),
      user_id: userId
    };
    
    const { error } = await supabase
      .from('messages')
      .insert(messageData);

    if (error) {
      logger.error('[DB] 💾 Erreur Supabase lors de la sauvegarde:', {
        error: error,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      logger.error('[DB] 💾 Données tentées d\'insertion:', messageData);
      return null;
    }

    // Insertion réussie - créer un objet avec un ID généré pour le retour
    const savedMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...messageData
    };
    
    logger.info(`[DB] 💾 Message sauvegardé avec succès: ID=${savedMessage.id}`);
    return savedMessage;
  } catch (error) {
    logger.error('[DB] 💾 Exception lors de la sauvegarde message:', {
      error: error,
      message: error.message,
      stack: error.stack
    });
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
