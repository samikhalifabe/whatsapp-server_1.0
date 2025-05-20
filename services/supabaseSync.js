const { supabase } = require('./database');
const { findOrCreateConversation } = require('../models/conversation');
const { saveMessage } = require('../models/message');
const logger = require('../utils/logger');

// Function to save a conversation and its messages from WhatsApp to Supabase
async function saveConversationToSupabase(conversation) {
  try {
    if (!conversation || !conversation.contact || !conversation.contact.number || conversation.contact.isGroup) {
      logger.debug('Conversation ignored (group or missing number):', conversation.chatName);
      return null;
    }

    // Extract the phone number
    const phoneNumber = conversation.contact.number;

    // Find or create the conversation in Supabase
    const dbConversation = await findOrCreateConversation(phoneNumber);

    if (!dbConversation) {
      logger.error('Could not create conversation for:', phoneNumber);
      return null;
    }

    // Update the chat_id and last_message_at
    await supabase
      .from('conversations')
      .update({
        chat_id: conversation.chatId,
        last_message_at: new Date().toISOString() // Update last message time during sync
      })
      .eq('id', dbConversation.id);

    // For each message
    let messagesCreated = 0;

    for (const message of conversation.messages) {
      // Check if the message already exists
      const { data: existingMessages, error: existingError } = await supabase
        .from('messages')
        .select('id') // Select only ID for existence check
        .eq('message_id', message.id)
        .eq('conversation_id', dbConversation.id);

      if (existingError) {
          logger.error(`Error checking for existing message ${message.id}:`, existingError);
          // Continue to the next message if check fails
          continue;
      }

      if (existingMessages && existingMessages.length > 0) {
        logger.debug(`Message ${message.id} already exists, skipping.`);
        continue;
      }

      // Save the message
      const savedMessage = await saveMessage(
        dbConversation.id,
        message.body,
        message.isFromMe,
        message.id, // Use original WhatsApp message ID
        new Date(message.timestamp * 1000).toISOString(), // Convert timestamp to ISO string
        dbConversation.user_id // Use the user ID from the DB conversation
      );

      if (savedMessage) {
        messagesCreated++;
      }
    }

    logger.info(`Saved conversation ${dbConversation.id} with ${messagesCreated} new messages.`);

    return {
      conversation: dbConversation,
      messagesCreated
    };
  } catch (error) {
    logger.error('Error saving conversation to Supabase:', error);
    throw error; // Re-throw the exception
  }
}

module.exports = {
  saveConversationToSupabase,
};
