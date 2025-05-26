const { supabase } = require('../services/database');
const logger = require('../utils/logger');
// const { getAiConfig } = require('../services/aiResponse'); // Might be needed if detection depends on AI config

// Function to detect a price offer in a message
function detectPriceOffer(message) {
  // Regex améliorée pour détecter les formats courants de prix en euros
  // Prend en compte les espaces, points ou virgules comme séparateurs de milliers/décimales.
  // Cherche des chiffres suivis optionnellement de "k" ou "K" (pour milliers) puis € ou euros.
  // Ou des phrases comme "je propose X euros", "offre à Y", etc.
  const priceRegex = /(?:je\s+(?:propose|offre|donne)|prix\s*(?:de|est\s*de)?|offre\s*(?:de|à)?|pour|à|mon\s*dernier\s*prix\s*est)\s*(\d{1,3}(?:[\s.,]?\d{3})*(?:[\.,]\d{1,2})?)\s*(k|K)?\s*(?:€|euros?|eur)/i;
  const match = message.match(priceRegex);

  if (match) {
    let priceStr = match[1].replace(/\s/g, '').replace(',', '.'); // Nettoyer le nombre
    let price = parseFloat(priceStr);

    if (match[2] && (match[2].toLowerCase() === 'k')) { // Si "k" ou "K" est présent
      price *= 1000;
    }

    if (!isNaN(price) && price > 0) {
      return { detected: true, price: price, currency: 'EUR' };
    }
  }
  // Regex plus simple juste pour un nombre suivi de € ou euros, sans mots-clés avant.
  const simplePriceRegex = /(\d{1,3}(?:[\s.,]?\d{3})*(?:[\.,]\d{1,2})?)\s*(k|K)?\s*(?:€|euros?|eur)/i;
  const simpleMatch = message.match(simplePriceRegex);
  if (simpleMatch) {
    let priceStr = simpleMatch[1].replace(/\s/g, '').replace(',', '.');
    let price = parseFloat(priceStr);
     if (simpleMatch[2] && (simpleMatch[2].toLowerCase() === 'k')) {
      price *= 1000;
    }
    if (!isNaN(price) && price > 0) {
      return { detected: true, price: price, currency: 'EUR' };
    }
  }

  // Regex pour les nombres de 4 ou 5 chiffres, potentiellement avec espace comme séparateur de milliers,
  // et optionnellement 'k' ou un symbole monétaire.
  // Ex: "18000", "18 000", "18k", "18000€"
  // \b pour s'assurer que c'est un "mot" isolé.
  // (?: ... )? rend le groupe monétaire optionnel.
  const directNumberRegex = /\b(\d{1,2}(?:\s?\d{3})|\d{4,5})\s*(k|K)?(?:\s*(?:€|euros?|eur))?\b/i;
  const directMatch = message.match(directNumberRegex);

  if (directMatch) {
    let priceStr = directMatch[1].replace(/\s/g, ''); // Enlever les espaces pour "18 000" -> "18000"
    let price = parseFloat(priceStr);

    if (directMatch[2] && (directMatch[2].toLowerCase() === 'k')) { // Gestion du "k"
      price *= 1000;
    }

    // Heuristique de plausibilité pour un prix de véhicule
    const isPlausiblePrice = !isNaN(price) && price >= 500 && price <= 200000; // Fourchette ajustable

    if (isPlausiblePrice) {
      // Pour réduire les faux positifs, on peut vérifier si le message est court
      // ou si le nombre est le seul contenu numérique significatif.
      const wordCount = message.split(/\s+/).length;
      const justTheNumber = message.trim() === directMatch[0].trim(); // Le message est-il juste le prix détecté ?

      if (justTheNumber || wordCount <= 5) { // Si c'est juste le nombre, ou un message très court
        logger.debug(`Prix direct détecté: ${price} (message: "${message}")`);
        return { detected: true, price: price, currency: 'EUR', context: 'direct_number' };
      }
    }
  }

  return { detected: false };
}

// Function to create a price offer in the DB
async function createPriceOfferInDB(conversationId, vehicleId, userId, messageId, price, currency = 'EUR') {
  if (!conversationId || !price) {
    logger.error('createPriceOfferInDB: conversationId and price are required.');
    return null;
  }
  try {
    // S'assurer que messageId est un UUID valide ou null
    let validMessageId = null;
    if (messageId && typeof messageId === 'string' && messageId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      // Vérifier si ce message existe réellement (pour éviter les contraintes FK avec RLS)
      const { data: messageExists } = await supabase
        .from('messages')
        .select('id')
        .eq('id', messageId)
        .single();
      
      if (messageExists) {
        validMessageId = messageId;
        logger.info(`Message ID vérifié et existe: ${messageId}`);
      } else {
        logger.info(`Message ID généré par RLS, ne peut pas être référencé: ${messageId}`);
        validMessageId = null;
      }
    } else if (messageId && typeof messageId === 'object' && messageId.id) {
      // Si messageId est un objet avec un id
      validMessageId = messageId.id;
    }
    
    logger.info(`Saving price offer with messageId: ${messageId} -> validMessageId: ${validMessageId}`);
    
    const { data, error } = await supabase
      .from('price_offers')
      .insert({
        conversation_id: conversationId,
        vehicle_id: vehicleId, // Can be null if not directly linked to a vehicle at the time of the offer
        user_id: userId,
        message_id: validMessageId, // UUID valide ou null
        offered_price: price,
        offer_currency: currency,
        status: 'pending', // Initial status
        notes: `Offre détectée automatiquement: ${price} ${currency}`
      })
      .select()
      .single(); // To return the inserted object

    if (error) {
      logger.error('Error saving price offer:', error);
      throw new Error('Error saving price offer');
    }
    logger.info(`Price offer of ${price} ${currency} saved successfully (ID: ${data.id}) for conversation ${conversationId}`);
    return data;
  } catch (err) {
    logger.error('Exception during saving price offer:', err);
    throw err;
  }
}

module.exports = {
  detectPriceOffer,
  createPriceOfferInDB,
};
