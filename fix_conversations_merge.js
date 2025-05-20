const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Configuration Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Fonction pour modifier le serveur afin d'éviter la perte des conversations
 */
async function modifyServerToPreserveConversations() {
  console.log('Modification du serveur pour préserver les conversations...');

  try {
    // Lire le fichier server.js
    const fs = require('fs');
    const path = require('path');
    const serverPath = path.join(__dirname, 'server.js');
    
    let serverContent = fs.readFileSync(serverPath, 'utf8');
    
    // Sauvegarder une copie du fichier original
    const backupPath = path.join(__dirname, 'server.js.backup2');
    fs.writeFileSync(backupPath, serverContent);
    console.log(`Sauvegarde du fichier server.js créée dans ${backupPath}`);
    
    // Modifier la fonction getRecentMessages pour augmenter la limite de chats
    const chatLimitPattern = /const chatLimit = Math\.min\(20, chats\.length\);/;
    const newChatLimit = 'const chatLimit = Math.min(100, chats.length); // Augmenté à 100 pour voir plus de conversations';
    
    serverContent = serverContent.replace(chatLimitPattern, newChatLimit);
    
    // Écrire le fichier modifié
    fs.writeFileSync(serverPath, serverContent);
    console.log('Fichier server.js modifié avec succès');
    
    // Maintenant, modifier le composant WhatsAppConversations.tsx
    const componentPath = path.join(__dirname, '../whatsappautomationV0/components/WhatsAppConversations.tsx');
    let componentContent = fs.readFileSync(componentPath, 'utf8');
    
    // Sauvegarder une copie du fichier original
    const componentBackupPath = path.join(__dirname, '../whatsappautomationV0/components/WhatsAppConversations.tsx.backup');
    fs.writeFileSync(componentBackupPath, componentContent);
    console.log(`Sauvegarde du composant créée dans ${componentBackupPath}`);
    
    // Modifier la fonction fetchConversations pour fusionner les conversations au lieu de les remplacer
    const fetchConversationsPattern = /const fetchConversations = async \(\) => \{[\s\S]*?setConversations\(chatGroups\);[\s\S]*?setError\(null\);/m;
    const newFetchConversations = `const fetchConversations = async () => {
    try {
      setLoading(true);
      console.log('Récupération des messages...');
      const response = await axios.get('http://localhost:3001/api/messages');
      console.log('Réponse messages:', response.data);
      
      // Regrouper les messages par chatId
      const messagesGroupedByChat: { [key: string]: Message[] } = {};
      
      response.data.forEach((msg: Message) => {
        const chatId = msg.chatId;
        if (!messagesGroupedByChat[chatId]) {
          messagesGroupedByChat[chatId] = [];
        }
        messagesGroupedByChat[chatId].push(msg);
      });
      
      // Créer les groupes de chat avec métadonnées
      const chatGroups: ChatGroup[] = Object.keys(messagesGroupedByChat).map(chatId => {
        const messages = messagesGroupedByChat[chatId];
        const firstMsg = messages[0]; // Supposons que les messages sont déjà triés
        
        // Extraire les numéros de téléphone
        const phoneNumbers = [
          firstMsg.from.replace('@c.us', ''),
          firstMsg.to.replace('@c.us', '')
        ].filter(phone => phone && phone !== 'Inconnu' && phone !== 'me');
        
        // Normaliser les numéros de téléphone
        const normalizedPhones = phoneNumbers.map(normalizePhoneNumber);
        
        // Trouver le véhicule correspondant
        let matchingVehicle = null;
        let matchDebugInfo = '';
        
        // Parcourir tous les véhicules pour trouver une correspondance
        for (const vehicle of vehicles) {
          const vehicleNormalizedPhone = normalizePhoneNumber(vehicle.phone || '');
          
          if (normalizedPhones.includes(vehicleNormalizedPhone) && vehicleNormalizedPhone) {
            matchingVehicle = vehicle;
            matchDebugInfo = \`Correspondance trouvée! Chat: \${normalizedPhones.join(', ')} | Véhicule: \${vehicleNormalizedPhone}\`;
            break;
          }
        }
        
        if (!matchingVehicle) {
          matchDebugInfo = \`Aucune correspondance trouvée pour les numéros: \${normalizedPhones.join(', ')}\`;
        }

        return {
          chatId: chatId,
          chatName: firstMsg.chatName || 'Chat sans nom',
          messages: messages.sort((a, b) => a.timestamp - b.timestamp), // Trier par date croissante
          lastMessageTime: Math.max(...messages.map(m => m.timestamp)),
          phoneNumber: firstMsg.from.includes('@c.us') ? firstMsg.from : 
                      (firstMsg.to && firstMsg.to.includes('@c.us') ? firstMsg.to : 'Inconnu'),
          rawPhoneNumbers: phoneNumbers,
          vehicle: matchingVehicle,
          debugInfo: \`Numéros: \${phoneNumbers.join(', ')} | Normalisés: \${normalizedPhones.join(', ')} | \${matchDebugInfo}\`
        };
      });
      
      // Trier les conversations par dernier message (plus récent en premier)
      chatGroups.sort((a, b) => b.lastMessageTime - a.lastMessageTime);
      
      // Fusionner avec les conversations existantes au lieu de les remplacer
      setConversations(prevConversations => {
        // Créer une copie des conversations existantes
        const mergedConversations = [...prevConversations];
        
        // Pour chaque nouvelle conversation
        for (const newChat of chatGroups) {
          // Vérifier si cette conversation existe déjà
          const existingIndex = mergedConversations.findIndex(c => c.chatId === newChat.chatId);
          
          if (existingIndex === -1) {
            // Si la conversation n'existe pas, l'ajouter
            mergedConversations.push(newChat);
          } else {
            // Si la conversation existe, fusionner les messages
            const existingChat = mergedConversations[existingIndex];
            
            // Créer un ensemble d'IDs de messages existants pour une recherche rapide
            const existingMessageIds = new Set(existingChat.messages.map(m => m.id));
            
            // Ajouter uniquement les nouveaux messages
            for (const msg of newChat.messages) {
              if (!existingMessageIds.has(msg.id)) {
                existingChat.messages.push(msg);
              }
            }
            
            // Trier les messages par timestamp
            existingChat.messages.sort((a, b) => a.timestamp - b.timestamp);
            
            // Mettre à jour le dernier message
            if (existingChat.messages.length > 0) {
              existingChat.lastMessageTime = Math.max(
                existingChat.lastMessageTime,
                existingChat.messages[existingChat.messages.length - 1].timestamp
              );
            }
            
            // Mettre à jour dans le tableau
            mergedConversations[existingIndex] = existingChat;
          }
        }
        
        // Trier les conversations fusionnées par dernier message
        return mergedConversations.sort((a, b) => b.lastMessageTime - a.lastMessageTime);
      });
      
      setError(null);`;
    
    componentContent = componentContent.replace(fetchConversationsPattern, newFetchConversations);
    
    // Modifier également la fonction fetchAllConversations pour fusionner les conversations
    const fetchAllConversationsPattern = /const fetchAllConversations = async \(\) => \{[\s\S]*?setConversations\(allChatGroups\);[\s\S]*?setUpdateSuccess\(true\);/m;
    const newFetchAllConversations = `const fetchAllConversations = async () => {
    try {
      setLoadingAllConversations(true);
      setError(null);
      
      console.log('Récupération de toutes les conversations WhatsApp...');
      const response = await axios.get('http://localhost:3001/api/whatsapp/all-conversations');
      console.log('Réponse conversations complètes:', response.data);
      
      // Vérifier la structure des données reçues
      if (response.data && response.data.conversations && Array.isArray(response.data.conversations)) {
        // Convertir les conversations en format ChatGroup
        const allChatGroups: ChatGroup[] = response.data.conversations.map((conversation: any) => {
          // Extraire les numéros de téléphone
          const phoneNumbers = [
            conversation.contact.number
          ].filter(phone => phone && phone !== 'Inconnu' && phone !== 'me');
          
          // Normaliser les numéros de téléphone
          const normalizedPhones = phoneNumbers.map(normalizePhoneNumber);
          
          // Trouver le véhicule correspondant
          let matchingVehicle = null;
          let matchDebugInfo = '';
          
          // Parcourir tous les véhicules pour trouver une correspondance
          for (const vehicle of vehicles) {
            const vehicleNormalizedPhone = normalizePhoneNumber(vehicle.phone || '');
            
            if (normalizedPhones.includes(vehicleNormalizedPhone) && vehicleNormalizedPhone) {
              matchingVehicle = vehicle;
              matchDebugInfo = \`Correspondance trouvée! Chat: \${normalizedPhones.join(', ')} | Véhicule: \${vehicleNormalizedPhone}\`;
              break;
            }
          }
          
          if (!matchingVehicle) {
            matchDebugInfo = \`Aucune correspondance trouvée pour les numéros: \${normalizedPhones.join(', ')}\`;
          }

          return {
            chatId: conversation.chatId,
            chatName: conversation.chatName || conversation.contact.name || 'Chat sans nom',
            messages: conversation.messages.sort((a: Message, b: Message) => a.timestamp - b.timestamp),
            lastMessageTime: Math.max(...conversation.messages.map((m: Message) => m.timestamp)),
            phoneNumber: conversation.contact.number.includes('@c.us') ? conversation.contact.number : \`\${conversation.contact.number}@c.us\`,
            rawPhoneNumbers: phoneNumbers,
            vehicle: matchingVehicle,
            debugInfo: \`Numéros: \${phoneNumbers.join(', ')} | Normalisés: \${normalizedPhones.join(', ')} | \${matchDebugInfo}\`
          };
        });
        
        // Trier les conversations par dernier message (plus récent en premier)
        allChatGroups.sort((a, b) => b.lastMessageTime - a.lastMessageTime);
        
        // Fusionner avec les conversations existantes au lieu de les remplacer
        setConversations(prevConversations => {
          // Créer une copie des conversations existantes
          const mergedConversations = [...prevConversations];
          
          // Pour chaque nouvelle conversation
          for (const newChat of allChatGroups) {
            // Vérifier si cette conversation existe déjà
            const existingIndex = mergedConversations.findIndex(c => c.chatId === newChat.chatId);
            
            if (existingIndex === -1) {
              // Si la conversation n'existe pas, l'ajouter
              mergedConversations.push(newChat);
            } else {
              // Si la conversation existe, fusionner les messages
              const existingChat = mergedConversations[existingIndex];
              
              // Créer un ensemble d'IDs de messages existants pour une recherche rapide
              const existingMessageIds = new Set(existingChat.messages.map(m => m.id));
              
              // Ajouter uniquement les nouveaux messages
              for (const msg of newChat.messages) {
                if (!existingMessageIds.has(msg.id)) {
                  existingChat.messages.push(msg);
                }
              }
              
              // Trier les messages par timestamp
              existingChat.messages.sort((a, b) => a.timestamp - b.timestamp);
              
              // Mettre à jour le dernier message
              if (existingChat.messages.length > 0) {
                existingChat.lastMessageTime = Math.max(
                  existingChat.lastMessageTime,
                  existingChat.messages[existingChat.messages.length - 1].timestamp
                );
              }
              
              // Mettre à jour dans le tableau
              mergedConversations[existingIndex] = existingChat;
            }
          }
          
          // Trier les conversations fusionnées par dernier message
          return mergedConversations.sort((a, b) => b.lastMessageTime - a.lastMessageTime);
        });
        
        setUpdateSuccess(true);`;
    
    componentContent = componentContent.replace(fetchAllConversationsPattern, newFetchAllConversations);
    
    // Écrire le fichier modifié
    fs.writeFileSync(componentPath, componentContent);
    console.log('Composant WhatsAppConversations.tsx modifié avec succès');
    
    console.log('Modifications apportées:');
    console.log('1. Augmentation de la limite de chats dans server.js de 20 à 100');
    console.log('2. Modification de fetchConversations pour fusionner les conversations au lieu de les remplacer');
    console.log('3. Modification de fetchAllConversations pour fusionner les conversations au lieu de les remplacer');
    
    console.log('\nPour appliquer ces modifications:');
    console.log('1. Redémarrez le serveur avec: node server.js');
    console.log('2. Redémarrez l\'application frontend');
    
  } catch (error) {
    console.error('Erreur lors de la modification des fichiers:', error);
  }
}

// Exécuter la fonction de modification
modifyServerToPreserveConversations()
  .then(() => {
    console.log('Modification terminée.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Erreur lors de la modification:', error);
    process.exit(1);
  });
