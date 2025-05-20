const { getMessagesByConversationId } = require('../models/message');
const { findOrCreateConversation } = require('../models/conversation'); // Needed to find conversation by phone
const { findVehicleByPhone } = require('../models/vehicle'); // Needed to find vehicle by phone
const logger = require('../utils/logger');
const { normalizePhoneNumber } = require('../utils/phoneNumber'); // Needed for phone number handling

// Function to retrieve messages for a vehicle
const getMessagesForVehicle = async (req, res, next) => {
  try {
    const { vehicleId } = req.params;

    logger.info('Retrieving messages for vehicle:', vehicleId);

    if (!vehicleId) {
      return res.status(400).json({ error: 'Vehicle ID is required' });
    }

    // Check if the vehicle exists and get its phone number
    const { data: vehicle, error: vehicleError } = await supabase
      .from('vehicles')
      .select('id, phone')
      .eq('id', vehicleId)
      .single();

    if (vehicleError) {
      logger.error('Error searching for vehicle:', vehicleError);
      return res.status(500).json({ error: 'Error retrieving vehicle' });
    }

    if (!vehicle) {
      logger.warn('Vehicle not found:', vehicleId);
      return res.json({ messages: [] });
    }

    // Find the conversation associated with this vehicle, potentially by phone number
    let conversation = null;
    // First, try finding by vehicle_id directly in conversations table (if implemented)
    const { data: convByVehicle, error: convByVehicleError } = await supabase
        .from('conversations')
        .select('id')
        .eq('vehicle_id', vehicleId)
        .maybeSingle();

    if (convByVehicleError) {
        logger.error(`Error searching for conversation by vehicle ID ${vehicleId}:`, convByVehicleError);
        // Continue to search by phone number if this fails
    } else if (convByVehicle) {
        conversation = convByVehicle;
    }


    // If no conversation found by vehicle_id, try by phone number
    if (!conversation && vehicle.phone) {
      const phoneNumber = normalizePhoneNumber(vehicle.phone);
      const { data: convByPhone, error: convByPhoneError } = await supabase
        .from('conversations')
        .select('id')
        .eq('phone_number', phoneNumber)
        .maybeSingle();

      if (convByPhoneError) {
         logger.error(`Error searching for conversation by phone number ${phoneNumber}:`, convByPhoneError);
         // Continue without conversation if this fails
      } else if (convByPhone) {
         conversation = convByPhone;
      }
    }


    if (!conversation) {
      logger.info('No conversation found for this vehicle');
      return res.json({ messages: [] });
    }

    // Retrieve messages for this conversation
    const messages = await getMessagesByConversationId(conversation.id);

    logger.info('Messages found:', messages ? messages.length : 0);

    // Format messages for the response (getMessagesByConversationId already formats)
    res.json({ messages });
  } catch (error) {
    logger.error('Exception retrieving messages for vehicle:', error);
    next(error); // Pass error to the error handling middleware
  }
};

// Function to retrieve messages for a conversation (contact)
const getMessagesForContact = async (req, res, next) => {
  try {
    const { contactId } = req.params; // contactId is actually conversationId

    if (!contactId) {
      return res.status(400).json({ error: 'Conversation ID is required' });
    }

    logger.info('Retrieving messages for conversation (contact):', contactId);

    // Retrieve messages for this conversation
    const messages = await getMessagesByConversationId(contactId);

    res.json({ messages });
  } catch (error) {
    logger.error('Exception retrieving messages for contact (conversation):', error);
    next(error); // Pass error to the error handling middleware
  }
};

module.exports = {
  getMessagesForVehicle,
  getMessagesForContact,
};
