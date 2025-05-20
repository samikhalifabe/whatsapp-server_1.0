const { openai, openaiApiKey, sanitizeTypingDelays, defaultAiConfig } = require('../config/ai');
const logger = require('../utils/logger');
const { supabase } = require('./database'); // Import supabase at the top

// Map to store conversation history (limited size)
const conversationHistory = new Map();
const MAX_HISTORY_LENGTH = 5; // Number of messages to keep in history

// Variable to hold the current AI configuration (loaded from DB)
let currentAiConfig = { ...defaultAiConfig }; // Start with defaults

// Function to load AI configuration from the database
async function loadAIConfigFromDB() {
  try {
    logger.info('Chargement de la configuration IA depuis Supabase...');
    // supabase is now imported at the top

    // Add a log to check the supabase object
    logger.debug('Supabase client object in loadAIConfigFromDB:', supabase ? 'Defined' : 'Undefined', typeof supabase);

    // Check if supabase is defined before proceeding
    if (!supabase) {
        logger.error('Supabase client is not available in loadAIConfigFromDB.');
        // Depending on desired behavior, you might throw an error or return
        // For now, let's proceed to see the error from the next line
    }

    let configToUse = null;

    const { data, error } = await supabase
      .from('ai_config')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      if (error) logger.error('Erreur lors du chargement de la configuration IA active:', error.message);

      const { data: latestConfig, error: latestError } = await supabase
        .from('ai_config')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (latestError || !latestConfig) {
        if (latestError) logger.error('Erreur lors du chargement de la dernière configuration IA:', latestError.message);
        logger.info('Aucune configuration IA trouvée dans la DB, utilisation des valeurs par défaut et sauvegarde.');
        // currentAiConfig already holds defaults, so save it.
        // Ensure typingDelays is sanitized before saving, though it should be by definition.
        currentAiConfig.typingDelays = sanitizeTypingDelays(currentAiConfig.typingDelays, false);
        await saveAIConfigToDB(currentAiConfig);
        return;
      }
      logger.info('Configuration active non trouvée, utilisation de la plus récente de la DB.');
      configToUse = latestConfig;
    } else {
      logger.info('Configuration IA active chargée avec succès depuis la DB.');
      configToUse = data;
    }

    currentAiConfig = {
      enabled: typeof configToUse.enabled === 'boolean' ? configToUse.enabled : !!openaiApiKey,
      respondToAll: typeof configToUse.respond_to_all === 'boolean' ? configToUse.respond_to_all : false,
      systemPrompt: configToUse.system_prompt || defaultAiConfig.systemPrompt,
      keywords: Array.isArray(configToUse.keywords) ? configToUse.keywords : defaultAiConfig.keywords,
      typingDelays: sanitizeTypingDelays(configToUse.typing_delays, false), // DB stores in ms
      unavailabilityKeywords: Array.isArray(configToUse.unavailability_keywords) ? configToUse.unavailability_keywords : defaultAiConfig.unavailabilityKeywords,
      pauseBotOnPriceOffer: typeof configToUse.pause_bot_on_price_offer === 'boolean' ? configToUse.pause_bot_on_price_offer : defaultAiConfig.pauseBotOnPriceOffer
    };
    logger.info('Configuration IA appliquée:', JSON.stringify(currentAiConfig, null, 2));

  } catch (err) {
    logger.error('Exception majeure lors du chargement de la configuration IA:', err);
    // Fallback to initial defaultAiConfig if all else fails
    currentAiConfig = { ...defaultAiConfig };
    currentAiConfig.typingDelays = sanitizeTypingDelays(currentAiConfig.typingDelays, false); // Ensure defaults are sanitized
    currentAiConfig.enabled = !!openaiApiKey; // Ensure AI is disabled if no key
  }
}

// Function to save AI configuration to the database
// Assumes input `config` has `typingDelays` with values in milliseconds
async function saveAIConfigToDB(config) {
  try {
    logger.info('Sauvegarde de la configuration IA dans Supabase:', JSON.stringify(config, null, 2));
    // supabase is now imported at the top

    await supabase
      .from('ai_config')
      .update({ active: false })
      .eq('active', true);

    // `config.typingDelays` is already sanitized and in milliseconds
    const dbTypingDelays = {
      enabled: config.typingDelays.enabled,
      minDelay: config.typingDelays.minDelay, // Already number in ms
      maxDelay: config.typingDelays.maxDelay, // Already number in ms
      wordsPerMinute: config.typingDelays.wordsPerMinute, // Already number
      randomizeDelay: config.typingDelays.randomizeDelay,
      showTypingIndicator: config.typingDelays.showTypingIndicator
    };

    const dbConfig = {
      enabled: config.enabled,
      respond_to_all: config.respondToAll,
      system_prompt: config.systemPrompt,
      keywords: config.keywords,
      typing_delays: dbTypingDelays,
      unavailability_keywords: Array.isArray(config.unavailabilityKeywords) ? config.unavailabilityKeywords : [],
      pause_bot_on_price_offer: typeof config.pauseBotOnPriceOffer === 'boolean' ? config.pauseBotOnPriceOffer : true,
      active: true
    };

    // Insérer la nouvelle configuration
    const { error } = await supabase
      .from('ai_config')
      .insert(dbConfig);

    if (error) {
      logger.error('Erreur lors de la sauvegarde de la configuration IA:', error);
      return false;
    }

    logger.info('Configuration IA sauvegardée avec succès');
    return true;
  } catch (error) {
    logger.error('Exception lors de la sauvegarde de la configuration IA:', error);
    return false;
  }
}

// Function to generate a response with ChatGPT (basic, might not be used directly)
async function generateAIResponse(message) {
  // Check if AI is enabled before attempting to generate a response
  if (!currentAiConfig.enabled) {
      logger.warn('AI is disabled. Skipping response generation.');
      return "Désolé, le service IA n'est pas disponible pour le moment. Un conseiller humain vous répondra bientôt.";
  }
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo", // Or gpt-4o
      messages: [
        {
          role: "system",
          content: currentAiConfig.systemPrompt
        },
        {
          role: "user",
          content: message
        }
      ],
      max_tokens: 150,
      temperature: 0.7,
    });

    return completion.choices[0].message.content;
  } catch (error) {
    logger.error('Error generating AI response:', error);
    return "Désolé, je n'ai pas pu traiter votre demande pour le moment. Un conseiller humain vous répondra bientôt.";
  }
}

// Improved function to generate a response with history and typing delay
async function generateAIResponseWithHistory(from, message) {
  // Check if AI is enabled before attempting to generate a response
  if (!currentAiConfig.enabled) {
      logger.warn('AI is disabled. Skipping response generation with history.');
       return currentAiConfig.typingDelays && currentAiConfig.typingDelays.enabled
        ? {
            text: "Désolé, le service IA n'est pas disponible pour le moment. Un conseiller humain vous répondra bientôt.",
            typingDelay: currentAiConfig.typingDelays.minDelay,
            showTypingIndicator: currentAiConfig.typingDelays.showTypingIndicator
          }
        : "Désolé, je n'ai pas pu traiter votre demande. Un conseiller humain vous répondra bientôt.";
  }

  try {
    logger.info(`🤖 Generating AI response for: ${message.substring(0, 50)}...`);

    // Retrieve or initialize history for this contact
    if (!conversationHistory.has(from)) {
      conversationHistory.set(from, []);
    }

    const history = conversationHistory.get(from);

    // Add the user's message to history
    history.push({
      role: "user",
      content: message
    });

    // Prepare messages for the API, including history
    const messages = [
      {
        role: "system",
        content: currentAiConfig.systemPrompt
      },
      ...history.slice(-MAX_HISTORY_LENGTH) // Only the last N messages
    ];

    logger.info(`📤 Sending request to OpenAI with ${messages.length} messages`);

    // Call the API with a 30-second timeout
    const completion = await Promise.race([
      openai.chat.completions.create({
        model: "gpt-4o", // Using gpt-4o as per original code
        messages: messages,
        max_tokens: 150,
        temperature: 0.7,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('30-second timeout exceeded')), 30000)
      )
    ]);

    const aiResponse = completion.choices[0].message.content;

    logger.info(`📥 Response received from OpenAI: ${aiResponse.substring(0, 50)}...`);

    // Add the response to history
    history.push({
      role: "assistant",
      content: aiResponse
    });

    // Limit history size
    if (history.length > MAX_HISTORY_LENGTH * 2) {
      history.splice(0, 2); // Remove the oldest messages
    }

    // If delays are enabled, calculate a realistic typing delay
    if (currentAiConfig.typingDelays && currentAiConfig.typingDelays.enabled) {
      // Calculate a delay based on the response length
      const wordCount = aiResponse.split(/\s+/).length;
      let typingTimeMs = Math.min(
        Math.max(wordCount * 60000 / currentAiConfig.typingDelays.wordsPerMinute, currentAiConfig.typingDelays.minDelay),
        currentAiConfig.typingDelays.maxDelay
      );

      // Add additional random delay if configured
      if (currentAiConfig.typingDelays.randomizeDelay) {
        // Add between 0% and 30% additional delay
        const randomFactor = 1 + (Math.random() * 0.3);
        typingTimeMs = Math.min(typingTimeMs * randomFactor, currentAiConfig.typingDelays.maxDelay);
      }

      logger.info(`⏱️ Calculated response delay: ${Math.round(typingTimeMs / 1000)} seconds for ${wordCount} words`);

      return {
        text: aiResponse,
        typingDelay: typingTimeMs,
        showTypingIndicator: currentAiConfig.typingDelays.showTypingIndicator
      };
    }

    // If delays are disabled, return just the response
    return aiResponse;
  } catch (error) {
    logger.error('❌ Error generating AI response:', error);
    return currentAiConfig.typingDelays && currentAiConfig.typingDelays.enabled
      ? {
          text: "Désolé, je n'ai pas pu traiter votre demande. Un conseiller humain vous répondra bientôt.",
          typingDelay: currentAiConfig.typingDelays.minDelay,
          showTypingIndicator: currentAiConfig.typingDelays.showTypingIndicator
        }
      : "Désolé, je n'ai pas pu traiter votre demande. Un conseiller humain vous répondra bientôt.";
  }
}

// Function to determine if the message should receive an automated response
function shouldAutoRespond(message) {
  if (!currentAiConfig.enabled) return false; // AI must be enabled
  if (currentAiConfig.respondToAll) return true;

  // Check if the message contains one of the trigger keywords
  const lowercaseMsg = message.toLowerCase();
  return currentAiConfig.keywords.some(keyword => lowercaseMsg.includes(keyword.toLowerCase()));
}

// Function to get the current AI configuration
function getAiConfig() {
  return currentAiConfig;
}

// Function to update the current AI configuration in memory and save to DB
async function updateAiConfig(newConfig) {
    logger.info('Updating AI configuration in memory and saving to DB:', JSON.stringify(newConfig, null, 2));

    // Sanitize typing delays from UI (they come in milliseconds from the frontend)
    const sanitizedTypingDelays = sanitizeTypingDelays(newConfig.typingDelays, false);

    currentAiConfig = {
        enabled: typeof newConfig.enabled === 'boolean' ? newConfig.enabled : currentAiConfig.enabled,
        respondToAll: typeof newConfig.respondToAll === 'boolean' ? newConfig.respondToAll : currentAiConfig.respondToAll,
        keywords: Array.isArray(newConfig.keywords) ? newConfig.keywords : currentAiConfig.keywords,
        systemPrompt: typeof newConfig.systemPrompt === 'string' ? newConfig.systemPrompt : currentAiConfig.systemPrompt,
        typingDelays: sanitizedTypingDelays, // Use the sanitized delays
        unavailabilityKeywords: Array.isArray(newConfig.unavailabilityKeywords) ? newConfig.unavailabilityKeywords.map(k => String(k).trim()).filter(k => k !== '') : currentAiConfig.unavailabilityKeywords,
        pauseBotOnPriceOffer: typeof newConfig.pauseBotOnPriceOffer === 'boolean' ? newConfig.pauseBotOnPriceOffer : currentAiConfig.pauseBotOnPriceOffer
    };
    logger.info('AI configuration updated in memory:', JSON.stringify(currentAiConfig, null, 2));

    // Save the updated configuration to the database
    const saved = await saveAIConfigToDB(currentAiConfig);

    return saved; // Return true if saved successfully, false otherwise
}


module.exports = {
  generateAIResponse, // Basic version, might not be used
  generateAIResponseWithHistory,
  shouldAutoRespond,
  loadAIConfigFromDB,
  saveAIConfigToDB, // Exported for initial save if needed
  getAiConfig,
  updateAiConfig,
  conversationHistory, // Export history map for potential external use (e.g., clearing)
  MAX_HISTORY_LENGTH,
};
