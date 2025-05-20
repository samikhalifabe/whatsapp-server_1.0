const { getWhatsAppStatus, getQRCode, sendWhatsAppMessage } = require('../services/whatsapp');
const { findOrCreateConversation } = require('../models/conversation'); // Needed to get conversation ID for saving message
const { saveMessage } = require('../models/message'); // Needed to save outgoing message
const { updateVehicleContactStatus } = require('../models/vehicle'); // Needed to update vehicle status
const logger = require('../utils/logger');
const { io } = require('../config/server'); // Import io for WebSocket emission
const { saveConversationToSupabase } = require('../services/supabaseSync'); // Import the sync function
const { supabase } = require('../services/database'); // Import supabase

// Function to get WhatsApp status
const getStatus = (req, res) => {
  logger.info('Status request received');
  const status = getWhatsAppStatus();
  res.json(status);
};

// Function to get QR code
const getQrCode = (req, res) => {
  logger.info('QR code request received');
  const qrcode = getQRCode();
  if (qrcode) {
    res.json({ qrcode });
  } else {
    res.status(404).json({ error: 'QR code not available' });
  }
};

// Function to handle message sending
const sendMessage = async (req, res) => {
  logger.info('Received message send request', req.body);
  try {
    const { number, message, vehicleId, userId } = req.body;

    if (!number || !message) {
      return res.status(400).json({ error: 'Number and message are required' });
    }

    // Find or create the conversation
    const conversation = await findOrCreateConversation(number, vehicleId, userId);

    if (!conversation) {
      return res.status(500).json({ error: 'Could not create conversation' });
    }

    // Send the message via WhatsApp service
    const sentMessage = await sendWhatsAppMessage(number, message, vehicleId, userId);

    // Store the message in the messages table
    const savedMessage = await saveMessage(
      conversation.id,
      message,
      true, // isFromMe
      sentMessage.id._serialized,
      new Date().toISOString(),
      userId || conversation.user_id
    );


    if (!savedMessage) {
      logger.error('Error storing outgoing message after sending.');
      // Continue without sending WebSocket if saving failed, but respond success to API
    } else {
      // Update the last message date
      await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversation.id);

      // Update vehicle contact status if available
      if (conversation.vehicle_id) {
        await updateVehicleContactStatus(conversation.vehicle_id, userId || conversation.user_id);
      }

      // Retrieve vehicle information if available (for WebSocket emission)
      let vehicle = null;
      if (conversation.vehicle_id) {
        const { data: vehicleData } = await supabase
          .from('vehicles')
          .select('id, brand, model, year, image_url')
          .eq('id', conversation.vehicle_id)
          .single();
        vehicle = vehicleData;
      }

      // Create a formatted message object for the client
      const formattedMessage = {
        id: savedMessage.id, // Use the DB ID
        message_id: sentMessage.id._serialized, // Original WhatsApp ID
        from: 'me',
        to: number,
        body: message,
        timestamp: new Date(savedMessage.timestamp).getTime() / 1000, // Use saved timestamp
        isFromMe: true,
        chatName: vehicle ? `${vehicle.brand} ${vehicle.model}` : 'Unnamed Chat',
        chatId: conversation.chat_id || conversation.id, // Use conversation chatId or ID
        conversation_id: conversation.id,
        vehicle: vehicle
      };

      // Emit the new message event to all connected clients
      logger.info('WebSocket Emission (outgoing message) - Details:', JSON.stringify(formattedMessage, null, 2));
      logger.info('Connected WebSocket clients:', io.engine.clientsCount);

      io.emit('new_message', formattedMessage);
      logger.info('Message emitted via WebSocket:', formattedMessage.body);
    }


    res.json({
      success: true,
      messageId: sentMessage.id._serialized,
      conversationId: conversation.id
    });
  } catch (error) {
    logger.error('Send message error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Function to retrieve recent messages from WhatsApp with more information
const getRecentMessages = async (req, res) => {
  try {
    const whatsappClient = require('../services/whatsapp').getWhatsAppClient(); // Get client instance

    if (!whatsappClient || !whatsappClient.info) {
      return res.status(503).json({
        error: 'WhatsApp client is not connected',
        status: 'disconnected'
      });
    }

    logger.info('Retrieving WhatsApp messages...');

    // Retrieve all chats
    const chats = await whatsappClient.getChats();
    logger.info(`${chats.length} chats found`);

    // Array to store all messages
    let allMessages = [];

    // Array to store formatted conversations
    let formattedConversations = [];

    // Number of chats to process (limit this number for better performance)
    const chatLimit = Math.min(100, chats.length); // Increased to 100 to see more conversations

    // For each chat, retrieve recent messages
    for (let i = 0; i < chatLimit; i++) {
      const chat = chats[i];
      try {
        // Get additional chat information
        const contact = await chat.getContact();

        // Retrieve recent messages (maximum 30 per chat)
        const messages = await chat.fetchMessages({ limit: 30 });

        // Format messages
        const formattedMessages = messages.map(msg => ({
          id: msg.id.id,
          from: msg.from,
          to: msg.to,
          body: msg.body,
          timestamp: msg.timestamp,
          isFromMe: msg.fromMe,
          chatName: chat.name || contact.pushname || contact.number || 'Unnamed Chat',
          chatId: chat.id._serialized,
          contact: {
            number: contact.number,
            name: contact.pushname || contact.name || '',
            isGroup: chat.isGroup
          }
        }));

        // Add to the array of all messages
        allMessages = [...allMessages, ...formattedMessages];

        // Add the formatted conversation
        if (!contact.isGroup) {
          formattedConversations.push({
            chatId: chat.id._serialized,
            chatName: chat.name || contact.pushname || contact.number || 'Unnamed Chat',
            contact: {
              number: contact.number,
              name: contact.pushname || contact.name || '',
              isGroup: contact.isGroup
            },
            messages: formattedMessages,
            messageCount: formattedMessages.length
          });
        }
      } catch (err) {
        logger.error(`Error retrieving messages for chat ${chat.name}:`, err);
      }
    }

    // Sort messages by timestamp (most recent first)
    allMessages.sort((a, b) => b.timestamp - a.timestamp);

    logger.info(`Total of ${allMessages.length} messages retrieved`);

    // Save conversations to Supabase
    logger.info('Saving recent conversations to Supabase...');

    // Statistics for saving to Supabase
    let conversationsSaved = 0;
    let totalMessagesSaved = 0;

    // Save each non-group conversation to Supabase
    for (const conversation of formattedConversations) {
      if (!conversation.contact.isGroup) {
        const result = await saveConversationToSupabase(conversation);
        if (result) {
          conversationsSaved++;
          totalMessagesSaved += result.messagesCreated;
        }
      }
    }
    logger.info(`${conversationsSaved} recent conversations saved to Supabase`);
    logger.info(`${totalMessagesSaved} recent messages saved to Supabase`);


    return res.json(allMessages);
  } catch (error) {
    logger.error('Exception retrieving WhatsApp messages:', error);
    return res.status(500).json({
      error: 'Server error retrieving messages',
      details: error.message
    });
  }
};

// Function to retrieve all contacted numbers and update statuses
const updateContactedVehicles = async (req, res) => {
  try {
    const whatsappClient = require('../services/whatsapp').getWhatsAppClient(); // Get client instance
    const { supabase } = require('../services/database'); // Import supabase

    if (!whatsappClient || !whatsappClient.info) {
      return res.status(503).json({
        error: 'WhatsApp client is not connected',
        status: 'disconnected'
      });
    }

    logger.info('Retrieving WhatsApp chats for status update...');

    // Retrieve all chats
    const chats = await whatsappClient.getChats();
    logger.info(`${chats.length} chats found`);

    // Array to store contacted numbers
    const contactedNumbers = new Set(); // Use a Set to avoid duplicates

    // For each chat, extract the phone number
    for (const chat of chats) {
      try {
        // Extract the phone number from chat.id._serialized (format: 33612345678@c.us)
        const chatId = chat.id._serialized;
        const match = chatId.match(/(\d+)@c\.us/);

        if (match && match[1]) {
          const phoneNumber = match[1];
          contactedNumbers.add(phoneNumber);
        }
      } catch (err) {
        logger.error('Error processing a chat for status update:', err);
      }
    }

    logger.info(`${contactedNumbers.size} unique phone numbers found in WhatsApp`);

    // Update the status in the database for each possible format
    const updatePromises = Array.from(contactedNumbers).flatMap(phone => {
        // Format the number for different possibilities in the database
        const formattedNumbers = [
            phone,                // Raw format: 33612345678
            `+${phone}`,          // With +: +33612345678
            phone.replace(/^33/, '0')  // French format: 0612345678
        ];

        return formattedNumbers.map(formattedNumber => {
             return supabase
                .from('vehicles')
                .update({ contact_status: 'contacted' })
                .filter('phone', 'ilike', `%${formattedNumber}%`); // Using ilike for partial match
        });
    });


    // Execute all updates
    const results = await Promise.all(updatePromises);

    // Log results (optional, can be verbose)
    // results.forEach((result, index) => {
    //     if (result.error) {
    //         logger.error(`Error updating status for promise ${index}:`, result.error);
    //     } else if (result.data && result.data.length > 0) {
    //          // logger.info(`Status updated for ${result.data.length} vehicles.`);
    //     }
    // });


    res.json({
      success: true,
      message: `${contactedNumbers.size} numbers found and statuses updated`,
      contactedNumbers: Array.from(contactedNumbers) // Return as array
    });
  } catch (error) {
    logger.error('Exception updating contacted vehicles:', error);
    res.status(500).json({
      error: 'Server error updating statuses',
      details: error.message
    });
  }
};

// Function to retrieve all WhatsApp conversations in full
const getAllWhatsAppConversations = async (req, res) => {
  try {
    const whatsappClient = require('../services/whatsapp').getWhatsAppClient(); // Get client instance
    const { supabase } = require('../services/database'); // Import supabase
    // saveConversationToSupabase is now imported from services/supabaseSync

    if (!whatsappClient || !whatsappClient.info) {
      return res.status(503).json({
        error: 'WhatsApp client is not connected',
        status: 'disconnected'
      });
    }

    logger.info('Retrieving all WhatsApp conversations...');

    // Retrieve all chats
    const chats = await whatsappClient.getChats();
    logger.info(`${chats.length} chats found in total`);

    // Array to store all conversations
    let allConversations = [];

    // For each chat, retrieve all messages
    for (let i = 0; i < chats.length; i++) {
      const chat = chats[i];
      try {
        logger.info(`Retrieving messages for chat ${i+1}/${chats.length}`);

        // Get contact or group information
        const contact = await chat.getContact();

        // Retrieve all messages (without limit)
        // Note: whatsapp-web.js may have limitations regarding the number of messages
        // it can retrieve at once, but we will try to maximize
        const messages = await chat.fetchMessages({ limit: 999999 }); // Use a very large value

        logger.info(`${messages.length} messages retrieved for this chat`);

        // Format messages
        const formattedMessages = messages.map(msg => ({
          id: msg.id.id,
          from: msg.from,
          to: msg.to,
          body: msg.body,
          timestamp: msg.timestamp,
          isFromMe: msg.fromMe,
          chatName: chat.name || contact.pushname || contact.number || 'Unnamed Chat',
          chatId: chat.id._serialized,
          contact: {
            number: contact.number,
            name: contact.pushname || contact.name || '',
            isGroup: chat.isGroup
          }
        }));

        // Add this conversation to the array
        allConversations.push({
          chatId: chat.id._serialized,
          chatName: chat.name || contact.pushname || contact.number || 'Unnamed Chat',
          contact: {
            number: contact.number,
            name: contact.pushname || contact.name || '',
            isGroup: chat.isGroup
          },
          messages: formattedMessages,
          messageCount: formattedMessages.length
        });
      } catch (err) {
        logger.error(`Error retrieving messages for chat ${i+1}:`, err);
      }
    }

    // Calculate statistics
    const totalMessages = allConversations.reduce((sum, conv) => sum + conv.messageCount, 0);

    logger.info(`Total of ${totalMessages} messages retrieved in ${allConversations.length} conversations`);

    // Update vehicle contact statuses
    const phoneNumbers = new Set();

    allConversations.forEach(conv => {
      if (!conv.contact.isGroup && conv.contact.number) {
        // Extract the phone number
        phoneNumbers.add(conv.contact.number);
      }
    });

    // Update statuses in the database
    for (const phone of phoneNumbers) {
      try {
        // Format the number for different possibilities
        const formattedNumbers = [
          phone,                   // Raw format
          `+${phone}`,             // With +
          phone.replace(/^33/, '0') // French format
        ];

        // Update for each possible format
        for (const formattedNumber of formattedNumbers) {
          const { error } = await supabase
            .from('vehicles')
            .update({ contact_status: 'contacted' })
            .filter('phone', 'ilike', `%${formattedNumber}%`);

          if (error) {
            logger.error(`Error updating status for ${formattedNumber}:`, error);
          }
        }
      } catch (err) {
        logger.error(`Error updating status for ${phone}:`, err);
      }
    }

    // Save conversations to Supabase
    logger.info('Saving conversations to Supabase...');

    // Statistics for saving to Supabase
    let conversationsSaved = 0;
    let totalMessagesSaved = 0;

    // Save each non-group conversation to Supabase
    for (const conversation of allConversations) {
      if (!conversation.contact.isGroup) {
        const result = await saveConversationToSupabase(conversation);
        if (result) {
          conversationsSaved++;
          totalMessagesSaved += result.messagesCreated;
        }
      }
    }
    logger.info(`${conversationsSaved} conversations saved to Supabase`);
    logger.info(`${totalMessagesSaved} messages saved to Supabase`);


    return res.json({
      success: true,
      conversations: allConversations,
      stats: {
        totalConversations: allConversations.length,
        totalMessages: totalMessages,
        phoneNumbersUpdated: [...phoneNumbers],
        // conversationsSaved, // Uncomment if saving is implemented
        // totalMessagesSaved // Uncomment if saving is implemented
      }
    });
  } catch (error) {
    logger.error('Exception retrieving WhatsApp conversations:', error);
    return res.status(500).json({
      error: 'Server error retrieving conversations',
      details: error.message
    });
  }
};


module.exports = {
  getStatus,
  getQrCode,
  sendMessage,
  getRecentMessages,
  updateContactedVehicles,
  getAllWhatsAppConversations,
};
