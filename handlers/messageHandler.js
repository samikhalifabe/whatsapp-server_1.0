const { findOrCreateConversation, updateConversationState } = require('../models/conversation');
const { saveMessage } = require('../models/message');
const { updateVehicleContactStatus, isVehicleUnavailableResponse } = require('../models/vehicle');
const { detectPriceOffer, createPriceOfferInDB } = require('../models/priceoffer');
const { shouldAutoRespond, generateAIResponseWithHistory, getAiConfig } = require('../services/aiResponse');
const logger = require('../utils/logger');
const { io } = require('../config/server');
const { supabase } = require('../services/database');

// Function to handle incoming messages
async function handleIncomingMessage(msg, whatsappClient) {
  logger.section('TRAITEMENT MESSAGE ENTRANT');
  logger.whatsapp.messageReceived(msg.from, msg.body);

  try {
    // Find or create the conversation
    const initialConversation = await findOrCreateConversation(msg.from);
    if (!initialConversation) {
      logger.database.error('Impossible de créer la conversation pour:', msg.from);
      return;
    }

    // Retrieve the current state and necessary info of the conversation
    const { data: currentConversationData, error: stateFetchError } = await supabase
        .from('conversations')
        .select('id, state, vehicle_id, user_id')
        .eq('id', initialConversation.id)
        .single();

    if (stateFetchError || !currentConversationData) {
        logger.database.error('Erreur récupération conversation:', stateFetchError);
        return;
    }

    const conversationId = currentConversationData.id;
    const currentConversationState = currentConversationData.state ?? 'active';
    const currentVehicleId = currentConversationData.vehicle_id;
    const currentUserId = currentConversationData.user_id;

    logger.info(`Conversation ${conversationId} - État: ${currentConversationState}`);

    // Save the incoming message
    const savedMessage = await saveMessage(
      conversationId,
      msg.body,
      false, // isFromMe
      msg.id._serialized,
      new Date(msg.timestamp * 1000).toISOString(),
      currentUserId
    );

    if (!savedMessage) {
      logger.database.error('Erreur sauvegarde message');
      return;
    }

    logger.database.saved('messages', savedMessage.id);

    // Update the last message date for the conversation
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId);

    // Update vehicle contact status if available
    if (currentVehicleId && !isVehicleUnavailableResponse(msg.body)) {
      await updateVehicleContactStatus(currentVehicleId, currentUserId);
    }

    // Conversation state management logic
    let newState = currentConversationState;
    let stateChangeReason = null;
    let detectedPrice = null;
    let priceDetectedMessageId = null;

    // Check for unavailability response
    if (isVehicleUnavailableResponse(msg.body)) {
      logger.info(`Message indisponibilité détecté de ${msg.from}`);
    } else {
       // Check for price offer
       const priceOfferCheck = detectPriceOffer(msg.body);
       const aiConfig = getAiConfig();

       if (priceOfferCheck.detected && priceOfferCheck.price) {
         logger.info(`Offre de prix détectée: ${priceOfferCheck.price} ${priceOfferCheck.currency}`);

         if (aiConfig.pauseBotOnPriceOffer && currentConversationState === 'active') {
           logger.info('Changement état vers negotiation');
           newState = 'negotiation';
           stateChangeReason = 'Prix détecté';
           detectedPrice = priceOfferCheck.price;
           priceDetectedMessageId = savedMessage?.id;

           await createPriceOfferInDB(
             conversationId,
             currentVehicleId,
             currentUserId,
             savedMessage?.id,
             priceOfferCheck.price,
             priceOfferCheck.currency
           );

           // Emit price offer event
           if (io) {
               io.emit('price_offer_detected', {
                 conversationId: conversationId,
                 chatId: initialConversation.chat_id || conversationId,
                 vehicleId: currentVehicleId,
                 price: detectedPrice,
                 currency: priceOfferCheck.currency,
                 contactNumber: msg.from,
                 messageBody: msg.body,
                 timestamp: Date.now() / 1000
               });
               logger.websocket.emit('price_offer_detected', `Offre de ${detectedPrice}${priceOfferCheck.currency}`);
           }
         }
       }
    }

    // Update conversation state if changed
    if (newState !== currentConversationState) {
      logger.info(`Changement état: ${currentConversationState} -> ${newState}`);
      const { error: updateStateError } = await supabase
        .from('conversations')
        .update({
          state: newState,
          last_state_change: new Date().toISOString(),
          state_change_reason: stateChangeReason,
          detected_price: detectedPrice,
          price_detected_at: detectedPrice ? new Date().toISOString() : null,
          price_detected_message_id: priceDetectedMessageId
        })
        .eq('id', conversationId);

      if (updateStateError) {
        logger.database.error('Erreur mise à jour état:', updateStateError);
      } else {
        logger.database.info(`État mis à jour: ${newState}`);
      }
    }

    // Decide if AI should respond
    const aiShouldRespondBasedOnConfig = shouldAutoRespond(msg.body);
    const shouldAIRespondNow = newState === 'active' && aiShouldRespondBasedOnConfig;

    logger.ai.info(`Décision IA: état=${newState}, shouldRespond=${aiShouldRespondBasedOnConfig}, final=${shouldAIRespondNow}`);

    // Retrieve vehicle information for incoming message WebSocket emission
    let vehicle = null;
    if (currentVehicleId) {
      const { data: vehicleData } = await supabase
        .from('vehicles')
        .select('id, brand, model, year, image_url')
        .eq('id', currentVehicleId)
        .single();
      vehicle = vehicleData;
    }

    // Create formatted message object for the incoming message
    const formattedMessage = {
      id: savedMessage?.id,
      message_id: msg.id._serialized,
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

    // *** ÉMISSION IMMÉDIATE DU MESSAGE ENTRANT VIA WEBSOCKET ***
    // Ceci doit être fait AVANT le traitement IA pour éviter les retards
    if (io) {
      logger.info(`[WEBSOCKET] Émission message entrant: ${JSON.stringify({
        id: formattedMessage.id,
        from: formattedMessage.from,
        body: formattedMessage.body,
        conversation_id: formattedMessage.conversation_id
      }, null, 2)}`);
      logger.info(`[WEBSOCKET] Clients connectés: ${io.engine.clientsCount}`);
      
      io.emit('new_message', formattedMessage);
      logger.websocket.info(`Message entrant émis via WebSocket: ${msg.from} -> "${msg.body}"`);
    } else {
      logger.websocket.warn('Socket.IO non disponible');
    }

    // Maintenant traiter la réponse IA (avec délai si nécessaire)
    if (shouldAIRespondNow) {
      logger.ai.info('Déclenchement réponse automatique');
      
      const aiResponse = await generateAIResponseWithHistory(msg.from, msg.body);
      
      if (typeof aiResponse === 'object' && aiResponse.typingDelay) {
        logger.ai.info(`Délai de frappe: ${Math.round(aiResponse.typingDelay / 1000)}s`);
        
        await new Promise(resolve => setTimeout(resolve, aiResponse.typingDelay));
        
        if (whatsappClient) {
          const sentMessage = await whatsappClient.sendMessage(msg.from, aiResponse.text);
          logger.whatsapp.messageSent(msg.from, aiResponse.text);
          
          // Save AI response
          const savedAiMessage = await saveMessage(conversationId, aiResponse.text, true, sentMessage.id._serialized, new Date().toISOString(), currentUserId);
          if (savedAiMessage) {
            logger.database.saved('messages', savedAiMessage.id);
            
            // Emit AI response via WebSocket
            if (io) {
              const formattedAiMessage = {
                id: savedAiMessage.id,
                message_id: sentMessage.id._serialized,
                from: 'me',
                to: msg.from,
                body: aiResponse.text,
                timestamp: new Date(savedAiMessage.timestamp).getTime() / 1000,
                isFromMe: true,
                chatName: initialConversation.chat_id || conversationId,
                chatId: initialConversation.chat_id || conversationId,
                conversation_id: conversationId,
                vehicle: null
              };
              io.emit('new_message', formattedAiMessage);
              logger.websocket.info('Réponse IA émise via WebSocket');
            }
          }
        }
      } else {
        // Handle simple response (string)
        const responseText = (typeof aiResponse === 'object' && aiResponse.text) ? aiResponse.text : aiResponse;
        if (responseText && whatsappClient) {
          const sentMessage = await whatsappClient.sendMessage(msg.from, responseText);
          logger.whatsapp.messageSent(msg.from, responseText);
          
          const savedAiMessage = await saveMessage(conversationId, responseText, true, sentMessage.id._serialized, new Date().toISOString(), currentUserId);
          if (savedAiMessage) {
            logger.database.saved('messages', savedAiMessage.id);
            
            // Emit AI response via WebSocket
            if (io) {
              const formattedAiMessage = {
                id: savedAiMessage.id,
                message_id: sentMessage.id._serialized,
                from: 'me',
                to: msg.from,
                body: responseText,
                timestamp: new Date(savedAiMessage.timestamp).getTime() / 1000,
                isFromMe: true,
                chatName: initialConversation.chat_id || conversationId,
                chatId: initialConversation.chat_id || conversationId,
                conversation_id: conversationId,
                vehicle: null
              };
              io.emit('new_message', formattedAiMessage);
              logger.websocket.info('Réponse IA simple émise via WebSocket');
            }
          }
        }
      }
    }

  } catch (error) {
    logger.error('Erreur traitement message:', error);
  } finally {
    logger.separator();
  }
}

// Function to handle outgoing messages
async function handleOutgoingMessage(msg, whatsappClient) {
  logger.whatsapp.info('Message sortant détecté');
  logger.whatsapp.messageSent(msg.to, msg.body);

  try {
    const initialConversation = await findOrCreateConversation(msg.to);
    if (!initialConversation) {
      logger.database.error('Impossible créer conversation pour:', msg.to);
      return;
    }

    const { data: currentConversationData, error: stateFetchError } = await supabase
        .from('conversations')
        .select('id, state, vehicle_id, user_id')
        .eq('id', initialConversation.id)
        .single();

    if (stateFetchError || !currentConversationData) {
        logger.database.error('Erreur récupération conversation:', stateFetchError);
        return;
    }

    const conversationId = currentConversationData.id;
    const currentUserId = currentConversationData.user_id;
    const currentVehicleId = currentConversationData.vehicle_id;

    // Save the outgoing message
    const savedMessage = await saveMessage(
      conversationId,
      msg.body,
      true, // isFromMe
      msg.id._serialized,
      new Date(msg.timestamp * 1000).toISOString(),
      currentUserId
    );

    if (!savedMessage) {
      logger.database.error('Erreur sauvegarde message sortant');
      return;
    }

    logger.database.saved('messages', savedMessage.id);

    // Update last message date
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId);

    // Retrieve vehicle information
    let vehicle = null;
    if (currentVehicleId) {
      const { data: vehicleData } = await supabase
        .from('vehicles')
        .select('id, brand, model, year, image_url')
        .eq('id', currentVehicleId)
        .single();
      vehicle = vehicleData;
    }

    // Create formatted message object
    const formattedMessage = {
      id: savedMessage.id,
      message_id: msg.id._serialized,
      from: 'me',
      to: msg.to,
      body: msg.body,
      timestamp: new Date(msg.timestamp * 1000).getTime() / 1000,
      isFromMe: true,
      chatName: vehicle ? `${vehicle.brand} ${vehicle.model}` : 'Chat sans nom',
      chatId: initialConversation.chat_id || conversationId,
      conversation_id: conversationId,
      vehicle: vehicle
    };

    // Emit outgoing message via WebSocket
    if (io) {
      io.emit('new_message', formattedMessage);
      logger.websocket.emit('new_message', `Message sortant vers ${msg.to}`);
    } else {
      logger.websocket.warn('Socket.IO non disponible');
    }

  } catch (error) {
    logger.error('Erreur traitement message sortant:', error);
  }
}

module.exports = {
  handleIncomingMessage,
  handleOutgoingMessage
};
