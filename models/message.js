const { supabase } = require('../services/database');
const logger = require('../utils/logger');

// Function to save a message
async function saveMessage(conversationId, body, isFromMe, messageId = null, timestamp = null, userId = null) {
  try {
    logger.info(`[DB] 💾 Tentative sauvegarde message: conversationId=${conversationId}, body="${body}", isFromMe=${isFromMe}, messageId=${messageId}`);
    
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
      .select('*');

    if (error) {
      logger.error('[DB] 💾 Erreur Supabase lors de la sauvegarde:', {
        error: error,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      logger.error('[DB] 💾 Données tentées d\'insertion:', {
        conversation_id: conversationId,
        body: body,
        is_from_me: isFromMe,
        message_id: messageId,
        timestamp: timestamp || new Date().toISOString(),
        user_id: userId
      });
      return null;
    }

    // Si l'insertion réussit mais qu'aucune donnée n'est retournée (RLS), 
    // on crée un objet factice pour que le handler continue
    if (!data || data.length === 0) {
      logger.warn('[DB] 💾 Insertion réussie mais aucune donnée retournée (probablement RLS)');
      const fakeMessage = {
        id: `fake-${Date.now()}`,
        conversation_id: conversationId,
        body: body,
        is_from_me: isFromMe,
        message_id: messageId,
        timestamp: timestamp || new Date().toISOString(),
        user_id: userId
      };
      logger.info(`[DB] 💾 Message sauvegardé avec succès (fake ID): ID=${fakeMessage.id}`);
      return fakeMessage;
    }

    logger.info(`[DB] 💾 Message sauvegardé avec succès: ID=${data[0]?.id}`);
    return data[0];
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
