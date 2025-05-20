const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Configuration Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Fonction pour modifier le serveur afin d'éviter les messages en double
 */
async function modifyServerToPreventDuplicates() {
  console.log('Modification du serveur pour éviter les messages en double...');

  try {
    // Lire le fichier server.js
    const fs = require('fs');
    const path = require('path');
    const serverPath = path.join(__dirname, 'server.js');
    
    let serverContent = fs.readFileSync(serverPath, 'utf8');
    
    // Sauvegarder une copie du fichier original
    const backupPath = path.join(__dirname, 'server.js.backup');
    fs.writeFileSync(backupPath, serverContent);
    console.log(`Sauvegarde du fichier server.js créée dans ${backupPath}`);
    
    // Modifier la fonction saveMessage pour vérifier les doublons
    const saveMessageFunction = `
// Fonction pour enregistrer un message
async function saveMessage(conversationId, body, isFromMe, messageId = null, timestamp = null, userId = null) {
  try {
    // Vérifier si un message similaire existe déjà
    const timeWindow = 10; // Fenêtre de 10 secondes pour regrouper les messages similaires
    const messageTime = timestamp ? new Date(timestamp) : new Date();
    const startTime = new Date(messageTime.getTime() - (timeWindow * 1000));
    const endTime = new Date(messageTime.getTime() + (timeWindow * 1000));
    
    // Rechercher des messages similaires
    const { data: existingMessages, error: searchError } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('body', body)
      .eq('is_from_me', isFromMe)
      .gte('timestamp', startTime.toISOString())
      .lte('timestamp', endTime.toISOString());
    
    if (searchError) {
      console.error('Erreur lors de la recherche de messages similaires:', searchError);
    } else if (existingMessages && existingMessages.length > 0) {
      console.log('Message similaire déjà existant, évitement du doublon');
      return existingMessages[0];
    }
    
    // Si aucun message similaire n'existe, insérer le nouveau message
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
}`;

    // Modifier la fonction saveConversationToSupabase pour améliorer la vérification des doublons
    const saveConversationFunction = `
// Fonction pour enregistrer une conversation et ses messages dans Supabase
async function saveConversationToSupabase(conversation) {
  try {
    if (!conversation || !conversation.contact || !conversation.contact.number || conversation.contact.isGroup) {
      console.log('Conversation ignorée (groupe ou numéro manquant):', conversation.chatName);
      return null;
    }
    
    // Extraire le numéro de téléphone
    const phoneNumber = conversation.contact.number;
    
    // Trouver ou créer la conversation dans Supabase
    const dbConversation = await findOrCreateConversation(phoneNumber);
    
    if (!dbConversation) {
      console.error('Impossible de créer la conversation pour:', phoneNumber);
      return null;
    }
    
    // Mettre à jour le chat_id
    await supabase
      .from('conversations')
      .update({ 
        chat_id: conversation.chatId,
        last_message_at: new Date().toISOString()
      })
      .eq('id', dbConversation.id);
    
    // Pour chaque message
    let messagesCreated = 0;
    
    for (const message of conversation.messages) {
      // Vérifier si le message existe déjà par ID
      if (message.id) {
        const { data: existingMessages } = await supabase
          .from('messages')
          .select('*')
          .eq('message_id', message.id)
          .eq('conversation_id', dbConversation.id);
        
        if (existingMessages && existingMessages.length > 0) {
          continue;
        }
      }
      
      // Vérifier si un message similaire existe déjà (même contenu, même expéditeur, timestamp proche)
      const timeWindow = 10; // Fenêtre de 10 secondes
      const messageTime = new Date(message.timestamp * 1000);
      const startTime = new Date(messageTime.getTime() - (timeWindow * 1000));
      const endTime = new Date(messageTime.getTime() + (timeWindow * 1000));
      
      const { data: similarMessages } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', dbConversation.id)
        .eq('body', message.body)
        .eq('is_from_me', message.isFromMe)
        .gte('timestamp', startTime.toISOString())
        .lte('timestamp', endTime.toISOString());
      
      if (similarMessages && similarMessages.length > 0) {
        console.log('Message similaire déjà existant, évitement du doublon');
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
    
    return {
      conversation: dbConversation,
      messagesCreated
    };
  } catch (error) {
    console.error('Erreur lors de l\\'enregistrement de la conversation:', error);
    return null;
  }
}`;

    // Remplacer les fonctions dans le fichier
    serverContent = serverContent.replace(/\/\/ Fonction pour enregistrer un message[\s\S]*?async function saveMessage[\s\S]*?}\n}/m, saveMessageFunction);
    serverContent = serverContent.replace(/\/\/ Fonction pour enregistrer une conversation[\s\S]*?async function saveConversationToSupabase[\s\S]*?}\n}/m, saveConversationFunction);
    
    // Écrire le fichier modifié
    fs.writeFileSync(serverPath, serverContent);
    console.log('Fichier server.js modifié avec succès');
    
    console.log('Modifications apportées:');
    console.log('1. Amélioration de la fonction saveMessage pour vérifier les doublons');
    console.log('2. Amélioration de la fonction saveConversationToSupabase pour vérifier les messages similaires');
    console.log('3. Ajout d\'une fenêtre de temps pour regrouper les messages similaires');
    
    console.log('\nPour appliquer ces modifications, redémarrez le serveur avec:');
    console.log('node server.js');
    
  } catch (error) {
    console.error('Erreur lors de la modification du serveur:', error);
  }
}

// Exécuter la fonction de modification
modifyServerToPreventDuplicates()
  .then(() => {
    console.log('Modification terminée.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Erreur lors de la modification:', error);
    process.exit(1);
  });
