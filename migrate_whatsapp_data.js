// Importer les modules nécessaires
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

// Configuration Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('FATAL ERROR: SUPABASE_URL and SUPABASE_KEY environment variables must be set.');
    process.exit(1); // Exit if Supabase credentials are not set
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Fonction pour normaliser un numéro de téléphone
function normalizePhoneNumber(phone) {
  if (!phone) return '';
  return phone.replace('@c.us', '').replace(/\D/g, '');
}

// Fonction pour trouver un véhicule par numéro de téléphone
async function findVehicleByPhone(phone) {
  // Formater le numéro de téléphone pour la recherche
  const formattedPhone = normalizePhoneNumber(phone);
  
  try {
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .filter('phone', 'ilike', `%${formattedPhone}%`);
    
    if (error) {
      console.error('Erreur lors de la recherche du véhicule:', error);
      return null;
    }
    
    if (data && data.length > 0) {
      return data[0];
    }
    
    return null;
  } catch (error) {
    console.error('Exception lors de la recherche du véhicule:', error);
    return null;
  }
}

// Fonction pour trouver ou créer une conversation
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
      console.error('Erreur lors de la recherche de conversation:', fetchError);
      return null;
    }
    
    // Si une conversation existe, la retourner
    if (existingConversations && existingConversations.length > 0) {
      return existingConversations[0];
    }
    
    // Si on n'a pas de vehicleId mais qu'on a un numéro de téléphone, essayer de trouver le véhicule
    if (!vehicleId) {
      const vehicle = await findVehicleByPhone(normalizedPhone);
      if (vehicle) {
        vehicleId = vehicle.id;
        userId = vehicle.user_id || userId;
      }
    }
    
    // Créer une nouvelle conversation
    const { data: newConversation, error: createError } = await supabase
      .from('conversations')
      .insert({
        vehicle_id: vehicleId,
        phone_number: normalizedPhone,
        user_id: userId || '00000000-0000-0000-0000-000000000000',
        last_message_at: new Date().toISOString()
      })
      .select();
    
    if (createError) {
      console.error('Erreur lors de la création de conversation:', createError);
      return null;
    }
    
    return newConversation[0];
  } catch (error) {
    console.error('Exception lors de la recherche/création de conversation:', error);
    return null;
  }
}

// Fonction pour enregistrer un message
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
      console.error('Erreur lors du stockage du message:', error);
      return null;
    }
    
    return data[0];
  } catch (error) {
    console.error('Exception lors du stockage du message:', error);
    return null;
  }
}

// Fonction pour migrer les conversations WhatsApp vers Supabase
async function migrateWhatsAppConversations() {
  try {
    console.log('Récupération des conversations WhatsApp depuis le serveur...');
    
    // Récupérer les conversations depuis le serveur WhatsApp
    const response = await fetch('http://localhost:3001/api/whatsapp/all-conversations');
    const data = await response.json();
    
    if (!data || !data.conversations || !Array.isArray(data.conversations)) {
      console.error('Format de données inattendu:', data);
      return;
    }
    
    console.log(`${data.conversations.length} conversations trouvées.`);
    
    // Compteurs pour les statistiques
    let conversationsCreated = 0;
    let messagesCreated = 0;
    let conversationsSkipped = 0;
    
    // Pour chaque conversation
    for (const conversation of data.conversations) {
      try {
        // Extraire le numéro de téléphone
        const phoneNumber = conversation.contact.number;
        
        if (!phoneNumber || conversation.contact.isGroup) {
          console.log('Conversation ignorée (groupe ou numéro manquant):', conversation.chatName);
          conversationsSkipped++;
          continue;
        }
        
        // Trouver ou créer la conversation dans Supabase
        const dbConversation = await findOrCreateConversation(phoneNumber);
        
        if (!dbConversation) {
          console.error('Impossible de créer la conversation pour:', phoneNumber);
          conversationsSkipped++;
          continue;
        }
        
        if (dbConversation) {
          conversationsCreated++;
          
          // Mettre à jour le chat_id
          await supabase
            .from('conversations')
            .update({ 
              chat_id: conversation.chatId,
              last_message_at: new Date().toISOString()
            })
            .eq('id', dbConversation.id);
          
          // Pour chaque message
          for (const message of conversation.messages) {
            // Vérifier si le message existe déjà
            const { data: existingMessages } = await supabase
              .from('messages')
              .select('*')
              .eq('message_id', message.id)
              .eq('conversation_id', dbConversation.id);
            
            if (existingMessages && existingMessages.length > 0) {
              console.log('Message déjà existant, ignoré:', message.id);
              continue;
            }
            
            // Enregistrer le message
            const savedMessage = await saveMessage(
              dbConversation.id,
              message.body,
              message.isFromMe,
              message.id,
              new Date(message.timestamp * 1000).toISOString(),
              dbConversation.user_id
            );
            
            if (savedMessage) {
              messagesCreated++;
            }
          }
        }
      } catch (error) {
        console.error('Erreur lors du traitement de la conversation:', error);
      }
    }
    
    console.log('Migration terminée!');
    console.log(`Conversations créées/mises à jour: ${conversationsCreated}`);
    console.log(`Messages créés: ${messagesCreated}`);
    console.log(`Conversations ignorées: ${conversationsSkipped}`);
    
  } catch (error) {
    console.error('Erreur lors de la migration des conversations:', error);
  }
}

// Exécuter la migration
migrateWhatsAppConversations()
  .then(() => {
    console.log('Script terminé.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Erreur lors de l\'exécution du script:', error);
    process.exit(1);
  });
