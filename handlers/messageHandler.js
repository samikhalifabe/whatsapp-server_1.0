const { findOrCreateConversation, updateConversationState } = require('../models/conversation');
const { saveMessage } = require('../models/message');
const { updateVehicleContactStatus, isVehicleUnavailableResponse } = require('../models/vehicle');
const { detectPriceOffer, createPriceOfferInDB } = require('../models/priceoffer');
const { shouldAutoRespond, generateAIResponseWithHistory, getAiConfig } = require('../services/aiResponse'); // getAiConfig needed for pauseBotOnPriceOffer
// const { getWhatsAppClient } = require('../services/whatsapp'); // Removed import to break circular dependency
const logger = require('../utils/logger');
const { io } = require('../config/server'); // Import io for WebSocket emission
const { supabase } = require('../services/database'); // Import supabase for direct DB updates
const { sendWhatsAppMessage } = require('../services/whatsapp'); // Import sendWhatsAppMessage if needed here

// Function to handle incoming messages - now accepts whatsappClient instance
async function handleIncomingMessage(msg, whatsappClient) {
  logger.info('Message received:', msg.body);
  logger.info('From:', msg.from);

  try {
    // Find or create the conversation
    const initialConversation = await findOrCreateConversation(msg.from);
    if (!initialConversation) {
      logger.error('Could not find or create a conversation for:', msg.from);
      return;
    }

    // Retrieve the current state and necessary info of the conversation
    const { data: currentConversationData, error: stateFetchError } = await supabase
        .from('conversations')
        .select('id, state, vehicle_id, user_id') // Include 'state'
        .eq('id', initialConversation.id)
        .single();

    if (stateFetchError || !currentConversationData) {
        logger.error(`Error fetching state for conversation ${initialConversation.id}:`, stateFetchError);
        return;
    }

    const conversationId = currentConversationData.id;
    const currentConversationState = currentConversationData.state ?? 'active'; // Default to 'active' if null
    const currentVehicleId = currentConversationData.vehicle_id;
    const currentUserId = currentConversationData.user_id;

    logger.info(`[MESSAGE HANDLER] Conversation ${conversationId} - Current state at start: ${currentConversationState}`);

    // --- Save the incoming message ---
    // Save the incoming message FIRST to get its ID
    const savedMessage = await saveMessage(
      conversationId,
      msg.body,
      false, // isFromMe
      msg.id._serialized,
      new Date(msg.timestamp * 1000).toISOString(),
      currentUserId // Use the user ID from the conversation
    );

    if (!savedMessage) {
      logger.error('Error storing incoming message.');
      // Continue processing if possible, but without the saved message ID
    } else {
      logger.info('Incoming message stored successfully in messages table (ID:', savedMessage.id, ')');

      // Update the last message date for the conversation
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId);

      // Update vehicle contact status if available and if the message does not indicate unavailability
      if (currentVehicleId && !isVehicleUnavailableResponse(msg.body)) {
        await updateVehicleContactStatus(currentVehicleId, currentUserId);
      }

      // --- Conversation state management logic ---
      let newState = currentConversationState;
      let stateChangeReason = null;
      let detectedPrice = null;
      let priceDetectedMessageId = null;

      // CHECK 1: Does the message indicate the vehicle is unavailable?
      if (isVehicleUnavailableResponse(msg.body)) {
        logger.info(`Message from ${msg.from} (conv ${conversationId}) detected as indicating unavailability.`);
        // Optionally: Change state to 'completed' or another specific state if desired
        // newState = 'completed';
        // stateChangeReason = 'Vehicle marked as unavailable';
        // The logic for marking the vehicle as sold is already handled in models/vehicle
        // await markVehicleAsSoldInDB(currentVehicleId); // Call this if state change implies sold
      } else {
         // CHECK 2: Was a price offer made?
         const priceOfferCheck = detectPriceOffer(msg.body);
         const aiConfig = getAiConfig(); // Get current AI config for pause setting
         logger.debug(`[PRICE CHECK] aiConfig.pauseBotOnPriceOffer: ${aiConfig.pauseBotOnPriceOffer}`);
         logger.debug(`[PRICE CHECK] currentConversationState for price check: ${currentConversationState}`);

         if (priceOfferCheck.detected && priceOfferCheck.price) {
           logger.info(`[PRICE CHECK] Price offer detected (${priceOfferCheck.price} ${priceOfferCheck.currency}) by ${msg.from} in message ID: ${savedMessage?.id}.`);

           // If the bot should be paused on price offer AND the current state is 'active'
           if (aiConfig.pauseBotOnPriceOffer && currentConversationState === 'active') {
             logger.info('[PRICE CHECK] Condition met to change state to "negotiation".');
             newState = 'negotiation';
             stateChangeReason = 'Price detected';
             detectedPrice = priceOfferCheck.price;
             priceDetectedMessageId = savedMessage?.id; // Link to the incoming message ID

             // Save the price offer in the price_offers table
             await createPriceOfferInDB(
               conversationId,
               currentVehicleId,
               currentUserId,
               savedMessage?.id, // ID of the incoming message
               priceOfferCheck.price,
               priceOfferCheck.currency
             );

             // Emit a WebSocket event to notify the UI
             if (io) {
                 io.emit('price_offer_detected', {
                   conversationId: conversationId,
                   chatId: initialConversation.chat_id || conversationId, // For the UI
                   vehicleId: currentVehicleId,
                   offerId: null, // The offer ID will be in savedOffer if we return it from createPriceOfferInDB
                   price: detectedPrice,
                   currency: priceOfferCheck.currency,
                   contactNumber: msg.from,
                   messageBody: msg.body,
                   timestamp: Date.now() / 1000
                 });
                 logger.info('price_offer_detected event emitted for conversation', conversationId);
             }


           } else if (currentConversationState !== 'active') {
             logger.info(`Price offer detected, but conversation state (${currentConversationState}) is not 'active'. AI will not respond.`);
             // AI will not respond because the state is not 'active', but we can still save the offer if desired
             // await createPriceOfferInDB(...) if we want to save all offers even in manual/negotiation state
           }
         }
      }

      // Update the conversation state in the DB if the state has changed
      if (newState !== currentConversationState) {
        logger.info(`[STATE UPDATE] Attempting state change for conversation ${conversationId}: ${currentConversationState} -> ${newState}. Reason: ${stateChangeReason}`);
        const { error: updateStateError } = await supabase
          .from('conversations')
          .update({
            state: newState,
            last_state_change: new Date().toISOString(),
            state_change_reason: stateChangeReason,
            detected_price: detectedPrice, // Can be null
            price_detected_at: detectedPrice ? new Date().toISOString() : null, // Can be null
            price_detected_message_id: priceDetectedMessageId // Can be null
          })
          .eq('id', conversationId);

        if (updateStateError) {
          logger.error(`[STATE UPDATE] Error updating conversation state ${conversationId}:`, updateStateError);
        } else {
          logger.info(`[STATE UPDATE] Conversation state ${conversationId} successfully updated in DB to ${newState}.`);
        }
      }

      // --- Decide if the AI should respond ---
      // The AI will respond ONLY if the state is 'active' (after potential modification by this message) AND shouldAutoRespond is true
      logger.debug(`[AI RESPONSE CHECK] Message body: "${msg.body}"`);
      logger.debug(`[AI RESPONSE CHECK] New conversation state: ${newState}`);
      const aiConfig = getAiConfig(); // Get current AI config
      logger.debug(`[AI RESPONSE CHECK] AI Config Enabled: ${aiConfig.enabled}`);
      logger.debug(`[AI RESPONSE CHECK] AI Config Respond To All: ${aiConfig.respondToAll}`);
      logger.debug(`[AI RESPONSE CHECK] AI Config Keywords: ${aiConfig.keywords.join(', ')}`);

      const aiShouldRespondBasedOnConfig = shouldAutoRespond(msg.body);
      logger.debug(`[AI RESPONSE CHECK] shouldAutoRespond(msg.body) result: ${aiShouldRespondBasedOnConfig}`);

      // Decide if the AI should respond using the NEW state of the conversation
      const shouldAIRespondNow = newState === 'active' && aiShouldRespondBasedOnConfig;
      logger.info(`[AI RESPONSE CHECK] Final decision (new state === 'active' && shouldAutoRespond): ${shouldAIRespondNow}`);


      if (shouldAIRespondNow) {
        logger.info('[AI RESPONSE CHECK] Triggering automated response generation...');
        const aiResponse = await generateAIResponseWithHistory(msg.from, msg.body);
        // const whatsappClient = getWhatsAppClient(); // Removed call here

        if (aiResponse && typeof aiResponse === 'object' && aiResponse.text) { // Response with delay
          // Block to handle response with delay
          logger.info(`Response generated with delay: ${Math.round(aiResponse.typingDelay / 1000)} seconds`);
          // const whatsappClient = getWhatsAppClient(); // Removed call here
          if (aiConfig.typingDelays.showTypingIndicator && whatsappClient && typeof whatsappClient.sendPresenceAvailable === 'function' && typeof whatsappClient.startTyping === 'function') {
            try { await whatsappClient.sendPresenceAvailable(msg.from); await whatsappClient.startTyping(msg.from); }
            catch (err) { logger.warn('Could not show typing indicator:', err.message); }
          }
          logger.info(`Waiting for ${Math.round(aiResponse.typingDelay / 1000)} seconds before sending response...`);
          await new Promise(resolve => setTimeout(resolve, aiResponse.typingDelay));
          if (aiConfig.typingDelays.showTypingIndicator && whatsappClient && typeof whatsappClient.stopTyping === 'function') {
            try { await whatsappClient.stopTyping(msg.from); }
            catch (err) { logger.warn('Could not stop typing indicator:', err.message); }
          }
          if (whatsappClient) {
              const sentMessage = await whatsappClient.sendMessage(msg.from, aiResponse.text);
              logger.info('Automated response sent:', aiResponse.text);
              try { // Save to DB
                const savedAiMessage = await saveMessage(conversationId, aiResponse.text, true, sentMessage.id._serialized, new Date().toISOString(), currentUserId);
                if (!savedAiMessage) { logger.error('Error saving AI response message.'); }
                else {
                  logger.info('AI response saved to database');
                  await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
                  // Emit the AI response via WebSocket
                  if (io) {
                      const formattedAiMessage = {
                          id: savedAiMessage.id,
                          message_id: sentMessage.id._serialized,
                          from: 'me',
                          to: msg.from,
                          body: aiResponse.text,
                          timestamp: new Date(savedAiMessage.timestamp).getTime() / 1000,
                          isFromMe: true,
                          chatName: initialConversation.chat_id || conversationId, // Use conversation chatId or ID
                          chatId: initialConversation.chat_id || conversationId,
                          conversation_id: conversationId,
                          vehicle: null // Vehicle info might need to be fetched if needed here
                      };
                      io.emit('new_message', formattedAiMessage);
                      logger.info('AI response emitted via WebSocket:', formattedAiMessage.body);
                  }
                }
              } catch (err) { logger.error('Exception during saving AI response:', err); }
          } else {
              logger.error('WhatsApp client not available to send AI response.');
          }


        } else {
          // Block to handle response without delay (or if aiResponse is just a string)
          const responseText = (typeof aiResponse === 'object' && aiResponse.text) ? aiResponse.text : aiResponse;
          if (responseText) { // Ensure there is something to send
            // const whatsappClient = getWhatsAppClient(); // Removed duplicate call
            if (whatsappClient) { // Use the client obtained outside the if/else
                const sentMessage = await whatsappClient.sendMessage(msg.from, responseText);
                logger.info('Automated response sent (simple):', responseText);
                try { // Save to DB
                  const savedAiMessage = await saveMessage(conversationId, responseText, true, sentMessage.id._serialized, new Date().toISOString(), currentUserId);
                  if (!savedAiMessage) { logger.error('Error saving AI response message (simple).'); }
                  else {
                    logger.info('AI response (simple) saved to database');
                    await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
                     // Emit the AI response via WebSocket
                    if (io) {
                        const formattedAiMessage = {
                            id: savedAiMessage.id,
                            message_id: sentMessage.id._serialized,
                            from: 'me',
                            to: msg.from,
                            body: responseText,
                            timestamp: new Date(savedAiMessage.timestamp).getTime() / 1000,
                            isFromMe: true,
                            chatName: initialConversation.chat_id || conversationId, // Use conversation chatId or ID
                            chatId: initialConversation.chat_id || conversationId,
                            conversation_id: conversationId,
                            vehicle: null // Vehicle info might need to be fetched if needed here
                        };
                        io.emit('new_message', formattedAiMessage);
                        logger.info('AI response (simple) emitted via WebSocket:', formattedAiMessage.body);
                    }
                  }
                } catch (err) { logger.error('Exception during saving AI response (simple):', err); }
            } else {
                 logger.error('WhatsApp client not available to send AI response (simple).');
            }
          } else {
            logger.info("Empty or invalid AI response, nothing was sent.");
          }
        }
      } // End of if (shouldAIRespondNow)
    } // End of else (message saved successfully)

    // Retrieve vehicle information if available (for incoming message WebSocket emission)
    let vehicle = null;
    if (currentVehicleId) {
      const { data: vehicleData } = await supabase
        .from('vehicles')
        .select('id, brand, model, year, image_url')
        .eq('id', currentVehicleId)
        .single();
      vehicle = vehicleData;
    }

    // Create a formatted message object for the client (for the incoming message)
    const formattedMessage = {
      id: savedMessage?.id, // Use the DB ID if available
      message_id: msg.id._serialized, // Original WhatsApp ID
      from: msg.from,
      to: 'me',
      body: msg.body,
      timestamp: new Date(msg.timestamp * 1000).getTime() / 1000,
      isFromMe: false,
      chatName: vehicle ? `${vehicle.brand} ${vehicle.model}` : 'Chat sans nom',
      chatId: initialConversation.chat_id || conversationId,
      conversation_id: conversationId,
      vehicle: vehicle
    };

    // Emit the new message event to all connected clients
    logger.info('WebSocket Emission - Incoming Message Details:', JSON.stringify(formattedMessage, null, 2));
    if (io) {
        logger.info('Connected WebSocket clients:', io.engine.clientsCount);
        io.emit('new_message', formattedMessage);
        logger.info('Incoming message emitted via WebSocket:', formattedMessage.body);
    } else {
        logger.warn('Socket.IO instance not available for WebSocket emission.');
    }


  } catch (error) {
    logger.error('Error processing incoming message:', error);
  } finally {
    logger.info('--- End Incoming Message Processing ---');
  }
}

module.exports = {
  handleIncomingMessage,
};
