const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Configuration Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Fonction pour nettoyer les messages en double dans la base de données
 */
async function cleanDuplicateMessages() {
  console.log('Début du nettoyage des messages en double...');

  try {
    // 1. Récupérer tous les messages
    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .order('timestamp', { ascending: true });

    if (error) {
      throw new Error(`Erreur lors de la récupération des messages: ${error.message}`);
    }

    console.log(`${messages.length} messages récupérés au total.`);

    // 2. Identifier les doublons
    const uniqueMessages = new Map();
    const duplicates = [];
    const uniqueCount = new Set();

    for (const message of messages) {
      // Créer une clé unique basée sur le contenu du message, l'expéditeur, le destinataire et une fenêtre de temps
      // Nous utilisons une fenêtre de 10 secondes pour regrouper les messages similaires
      const timeWindow = Math.floor(new Date(message.timestamp).getTime() / 10000);
      const key = `${message.body}_${message.is_from_me}_${message.conversation_id}_${timeWindow}`;

      if (!uniqueMessages.has(key)) {
        // Premier message avec cette combinaison, le conserver
        uniqueMessages.set(key, message);
        uniqueCount.add(message.id);
      } else {
        // Message en double, l'ajouter à la liste des doublons à supprimer
        duplicates.push(message);
      }
    }

    console.log(`${uniqueCount.size} messages uniques identifiés.`);
    console.log(`${duplicates.length} doublons identifiés.`);

    if (duplicates.length === 0) {
      console.log('Aucun doublon trouvé. Aucune action nécessaire.');
      return;
    }

    // 3. Supprimer les doublons
    console.log('Suppression des doublons...');
    
    // Supprimer par lots de 100 pour éviter les limitations d'API
    const batchSize = 100;
    for (let i = 0; i < duplicates.length; i += batchSize) {
      const batch = duplicates.slice(i, i + batchSize);
      const ids = batch.map(msg => msg.id);
      
      const { error: deleteError } = await supabase
        .from('messages')
        .delete()
        .in('id', ids);
      
      if (deleteError) {
        throw new Error(`Erreur lors de la suppression des doublons: ${deleteError.message}`);
      }
      
      console.log(`Lot ${Math.floor(i / batchSize) + 1}/${Math.ceil(duplicates.length / batchSize)} traité.`);
    }

    console.log(`${duplicates.length} doublons supprimés avec succès.`);
    console.log(`Il reste ${uniqueCount.size} messages uniques dans la base de données.`);

  } catch (error) {
    console.error('Erreur lors du nettoyage des messages en double:', error);
  }
}

// Exécuter la fonction de nettoyage
cleanDuplicateMessages()
  .then(() => {
    console.log('Nettoyage terminé.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Erreur lors du nettoyage:', error);
    process.exit(1);
  });
