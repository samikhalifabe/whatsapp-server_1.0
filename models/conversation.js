const { supabase } = require('../services/database');
const { normalizePhoneNumber } = require('../utils/phoneNumber');
const logger = require('../utils/logger');
const { findVehicleByPhone } = require('./vehicle'); // Assuming vehicle model exists

// Function to find or create a conversation
async function findOrCreateConversation(phoneNumber, vehicleId = null, userId = null) {
  try {
    // Normaliser le numéro de téléphone
    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    // Chercher une conversation existante
    const { data: existingConversations, error: fetchError } = await supabase
      .from('conversations')
      .select('*')
      .eq('phone_number', normalizedPhone);

    if (fetchError) {
      logger.error('Error searching for conversation:', fetchError);
      return null;
    }

    // If a conversation exists, return it
    if (existingConversations && existingConversations.length > 0) {
      return existingConversations[0];
    }

    // If we don't have a vehicleId but have a phone number, try to find the vehicle
    if (!vehicleId) {
      const vehicle = await findVehicleByPhone(normalizedPhone);
      if (vehicle) {
        vehicleId = vehicle.id;
        userId = vehicle.user_id || userId;
      }
    }

    // Create a new conversation
    const { data: newConversation, error: createError } = await supabase
      .from('conversations')
      .insert({
        vehicle_id: vehicleId,
        phone_number: normalizedPhone,
        user_id: userId,
        last_message_at: new Date().toISOString()
      })
      .select();

    if (createError) {
      logger.error('Error creating conversation:', createError);
      return null;
    }

    return newConversation[0];
  } catch (error) {
    logger.error('Exception during find/create conversation:', error);
    return null;
  }
}

// Function to retrieve all conversations from the database with pagination
async function getAllConversations(page = 1, limit = 20) {
  logger.info(`Retrieving conversations with pagination: page ${page}, limit ${limit}`);
  try {
    const offset = (page - 1) * limit;

    // Fetch paginated conversations
    const { data: conversations, error: conversationsError, count } = await supabase
      .from('conversations')
      .select(`
        id,
        phone_number,
        chat_id,
        last_message_at,
        state,
        last_state_change,
        state_change_reason,
        detected_price,
        price_detected_at,
        price_detected_message_id,
        vehicle_id,
        created_at
      `, { count: 'exact' }) // Request total count
      .order('last_message_at', { ascending: false })
      .range(offset, offset + limit - 1); // Apply pagination

    if (conversationsError) {
      logger.error('Error retrieving conversations:', conversationsError);
      if (conversationsError.details) logger.error('Supabase Error Details:', conversationsError.details);
      if (conversationsError.hint) logger.error('Supabase Error Hint:', conversationsError.hint);
      throw new Error('Error retrieving conversations');
    }

    // Fetch last message and vehicle data for each paginated conversation
    const formattedConversations = await Promise.all(conversations.map(async (conv) => {
      let lastMessage = null;
      try {
        const { data: messages, error: messagesError } = await supabase
          .from('messages')
          .select('id, body, timestamp, is_from_me') // Select only necessary fields
          .eq('conversation_id', conv.id)
          .order('timestamp', { ascending: false })
          .limit(1);

        if (messagesError) {
          logger.error(`Error retrieving last message for conversation ${conv.id}:`, messagesError);
          if (messagesError.details) logger.error('Supabase Last Message Error Details:', messagesError.details);
          if (messagesError.hint) logger.error('Supabase Last Message Error Hint:', messagesError.hint);
        } else if (messages && messages.length > 0) {
          lastMessage = messages[0];
        }
      } catch (error) {
        logger.error(`Exception retrieving last message for conversation ${conv.id}:`, error);
      }


      let vehicleData = null;
      if (conv.vehicle_id) {
        try {
          const { data: vehicle, error: vehicleError } = await supabase
            .from('vehicles')
            .select('id, brand, model, year, image_url') // Select only necessary fields, including image_url
            .eq('id', conv.vehicle_id)
            .single();
          if (vehicleError) {
            logger.error(`Error retrieving vehicle ${conv.vehicle_id} for conversation ${conv.id}:`, vehicleError);
            if (vehicleError.details) logger.error('Supabase Vehicle Error Details:', vehicleError.details);
            if (vehicleError.hint) logger.error('Supabase Vehicle Error Hint:', vehicleError.hint);
          } else {
            vehicleData = vehicle;
          }
        } catch (error) {
          logger.error(`Exception retrieving vehicle ${conv.vehicle_id} for conversation ${conv.id}:`, error);
        }
      }

      return {
        id: conv.id,
        phoneNumber: conv.phone_number,
        chatId: conv.chat_id || conv.id,
        lastMessageAt: conv.last_message_at,
        state: conv.state,
        lastStateChange: conv.last_state_change,
        stateChangeReason: conv.state_change_reason,
        detectedPrice: conv.detected_price,
        priceDetectedAt: conv.price_detected_at,
        priceDetectedMessageId: conv.price_detected_message_id,
        vehicle: vehicleData,
        messages: [], // Messages are not included in this paginated list
        lastMessage: lastMessage
      };
    }));

    const totalPages = Math.ceil((count || 0) / limit);

    return {
      conversations: formattedConversations,
      pagination: {
        page: page,
        limit: limit,
        total: count || 0,
        totalPages: totalPages
      }
    };

  } catch (error) {
    logger.error('Exception retrieving conversations with pagination:', error);
    throw error; // Re-throw the exception
  }
}

// Function to retrieve a specific conversation by ID
async function getConversationById(id) {
  logger.info('Retrieving conversation:', id);
  try {
    // Retrieve the conversation
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select(`
        *,
        vehicles(*)
      `) // Fetch vehicle data directly
      .eq('id', id)
      .single();

    if (convError) {
      logger.error('Error retrieving conversation:', convError);
      return null;
    }

    if (!conversation) {
      return null;
    }

    // Messages will be fetched separately by getMessagesByConversationId

    return {
      id: conversation.id,
      phoneNumber: conversation.phone_number,
      chatId: conversation.chat_id || conversation.id,
      lastMessageAt: conversation.last_message_at,
      state: conversation.state,
      lastStateChange: conversation.last_state_change,
      stateChangeReason: conversation.state_change_reason,
      detectedPrice: conversation.detected_price,
      priceDetectedAt: conversation.price_detected_at,
      priceDetectedMessageId: conversation.price_detected_message_id,
      vehicle: conversation.vehicles, // Vehicle data is already nested
    };
  } catch (error) {
    logger.error('Exception retrieving conversation:', error);
    throw error;
  }
}

// Function to update conversation state
async function updateConversationState(id, state, reason = 'Manual update') {
  logger.info(`Attempting to update conversation ${id} state to: ${state}`);
  try {
    const { data, error } = await supabase
      .from('conversations')
      .update({
        state: state,
        last_state_change: new Date().toISOString(),
        state_change_reason: reason
      })
      .eq('id', id)
      .select(); // Select the updated row to return it

    if (error) {
      logger.error(`Error updating conversation ${id} state:`, error);
      throw new Error('Error updating conversation state');
    }

    if (!data || data.length === 0) {
       logger.warn(`No conversation found with ID ${id} for update.`);
       return null;
    }

    logger.info(`Conversation ${id} state updated successfully to ${state}.`);
    return data[0];

  } catch (error) {
    logger.error('Exception updating conversation state:', error);
    throw error;
  }
}


module.exports = {
  findOrCreateConversation,
  getAllConversations,
  getConversationById,
  updateConversationState,
};
