const { openai, grokApiKey, sanitizeTypingDelays, defaultAiConfig, getModelApiParams } = require('../config/ai');
const logger = require('../utils/logger');
const { supabase } = require('./database'); // Import supabase at the top
const Message = require('../models/Message'); // Import Message model for history
const { normalizePhoneNumber } = require('../utils/phoneNumber'); // Import phone number utils

// Map to store conversation history (limited size)
const conversationHistory = new Map();
const MAX_HISTORY_LENGTH = 15; // Number of messages to keep in history (increased for better context)

// Variable to hold the current AI configuration (loaded from DB)
let currentAiConfig = { ...defaultAiConfig }; // Start with defaults

// Function to load AI configuration from the database
async function loadAIConfigFromDB() {
  try {
    logger.ai.config('chargement depuis Supabase');

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
      if (error) logger.ai.error('Configuration active non trouvée:', error.message);

      const { data: latestConfig, error: latestError } = await supabase
        .from('ai_config')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (latestError || !latestConfig) {
        if (latestError) logger.ai.error('Dernière configuration non trouvée:', latestError.message);
        logger.ai.config('utilisation des valeurs par défaut');
        // currentAiConfig already holds defaults, so save it.
        // Ensure typingDelays is sanitized before saving, though it should be by definition.
        currentAiConfig.typingDelays = sanitizeTypingDelays(currentAiConfig.typingDelays, false);
        await saveAIConfigToDB(currentAiConfig);
        return;
      }
      logger.ai.config('utilisation de la plus récente');
      configToUse = latestConfig;
    } else {
      logger.ai.config('chargée avec succès');
      configToUse = data;
    }

    currentAiConfig = {
      enabled: typeof configToUse.enabled === 'boolean' ? configToUse.enabled : !!grokApiKey,
      respondToAll: typeof configToUse.respond_to_all === 'boolean' ? configToUse.respond_to_all : false,
      systemPrompt: configToUse.system_prompt || defaultAiConfig.systemPrompt,
      keywords: Array.isArray(configToUse.keywords) ? configToUse.keywords : defaultAiConfig.keywords,
      typingDelays: sanitizeTypingDelays(configToUse.typing_delays, false), // DB stores in ms
      unavailabilityKeywords: Array.isArray(configToUse.unavailability_keywords) ? configToUse.unavailability_keywords : defaultAiConfig.unavailabilityKeywords,
      pauseBotOnPriceOffer: typeof configToUse.pause_bot_on_price_offer === 'boolean' ? configToUse.pause_bot_on_price_offer : defaultAiConfig.pauseBotOnPriceOffer
    };
    logger.ai.config('appliquée');

  } catch (err) {
    logger.ai.error('Exception lors du chargement:', err);
    // Fallback to initial defaultAiConfig if all else fails
    currentAiConfig = { ...defaultAiConfig };
    currentAiConfig.typingDelays = sanitizeTypingDelays(currentAiConfig.typingDelays, false); // Ensure defaults are sanitized
    currentAiConfig.enabled = !!grokApiKey; // Ensure AI is disabled if no key
  }
}

// Function to save AI configuration to the database
// Assumes input `config` has `typingDelays` with values in milliseconds
async function saveAIConfigToDB(config) {
  try {
    logger.ai.config('sauvegarde en cours');
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
      logger.ai.error('Erreur lors de la sauvegarde:', error);
      return false;
    }

    logger.ai.config('sauvegardée avec succès');
    return true;
  } catch (error) {
    logger.ai.error('Exception lors de la sauvegarde:', error);
    return false;
  }
}

// Function to find conversation by phone number (avoiding circular dependency)
async function findConversationByPhone(phoneNumber) {
  try {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('id, phone_number, vehicle_id, detected_price, state')
      .eq('phone_number', normalizedPhone)
      .limit(1);
    
    if (error) {
      logger.error('Error finding conversation by phone:', error);
      return null;
    }
    
    return conversations && conversations.length > 0 ? conversations[0] : null;
  } catch (error) {
    logger.error('Exception finding conversation by phone:', error);
    return null;
  }
}

// Function to load conversation history from Supabase database
async function loadConversationHistoryFromDB(phoneNumber) {
  try {
    logger.info(`📚 Loading conversation history from DB for contact: ${phoneNumber}`);
    
    // First, find the conversation ID from the phone number
    const conversation = await findConversationByPhone(phoneNumber);
    
    if (!conversation || !conversation.id) {
      logger.info(`📭 No conversation found for phone number: ${phoneNumber}`);
      return [];
    }
    
    logger.info(`🔍 Found conversation ID: ${conversation.id} for phone: ${phoneNumber}`);
    
    // Log conversation details for context
    if (conversation.detected_price) {
      logger.info(`💰 Conversation has detected price: ${conversation.detected_price}€`);
    }
    if (conversation.state) {
      logger.info(`📊 Conversation state: ${conversation.state}`);
    }
    
    // Get messages for this conversation, ordered by timestamp (newest first)
    const messages = await Message.getMessagesByConversationId(conversation.id);
    
    if (!messages || messages.length === 0) {
      logger.info(`📭 No message history found for conversation: ${conversation.id}`);
      return [];
    }
    
    // Convert messages to OpenAI format, excluding system messages
    const history = [];
    
    // Take only the most recent messages and reverse to get chronological order (oldest first)
    const recentMessages = messages.slice(-MAX_HISTORY_LENGTH).reverse();
    
    recentMessages.forEach(msg => {
      // Skip system messages and empty content
      if (!msg.body || msg.body.trim() === '') return;
      
      // Determine role based on is_from_me field
      const role = msg.is_from_me ? 'assistant' : 'user';
      
      history.push({
        role: role,
        content: msg.body.trim()
      });
    });
    
    logger.info(`📖 Loaded ${history.length} messages from DB for context (conversation: ${conversation.id})`);
    return history;
    
  } catch (error) {
    logger.error(`❌ Error loading conversation history from DB for ${phoneNumber}:`, error);
    return []; // Return empty array on error
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
      model: "grok-3-mini", // Grok 3 Mini model
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
      max_tokens: 1000,
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
  if (!currentAiConfig.enabled) {
    logger.ai.warn('IA désactivée, réponse ignorée');
    return currentAiConfig.typingDelays && currentAiConfig.typingDelays.enabled
      ? {
          text: "Désolé, le service IA n'est pas disponible pour le moment. Un conseiller humain vous répondra bientôt.",
          typingDelay: currentAiConfig.typingDelays.minDelay,
          showTypingIndicator: currentAiConfig.typingDelays.showTypingIndicator
        }
      : "Désolé, je n'ai pas pu traiter votre demande. Un conseiller humain vous répondra bientôt.";
  }

  try {
    logger.ai.generating(message);

    // Load conversation history from Supabase database
    let dbHistory = await loadConversationHistoryFromDB(from);
    
    // Retrieve or initialize in-memory history for this contact (as fallback)
    if (!conversationHistory.has(from)) {
      conversationHistory.set(from, []);
    }

    const memoryHistory = conversationHistory.get(from);

    // Combine database history with current message
    // Priority: Use DB history if available, otherwise fallback to memory
    let contextHistory = [];
    
    if (dbHistory.length > 0) {
      // Use database history as primary source
      contextHistory = [...dbHistory];
      logger.info(`🗄️ Using ${dbHistory.length} messages from database for context`);
    } else if (memoryHistory.length > 0) {
      // Fallback to memory history
      contextHistory = [...memoryHistory];
      logger.info(`🧠 Using ${memoryHistory.length} messages from memory as fallback`);
    }

    // Add the current user message to context
    const currentUserMessage = {
      role: "user",
      content: message
    };
    
    contextHistory.push(currentUserMessage);
    
    // Also add to memory history for fallback
    memoryHistory.push(currentUserMessage);

    // Analyze emoji usage in recent AI messages
    const recentAIMessages = contextHistory
      .filter(msg => msg.role === 'assistant')
      .slice(-3); // Last 3 AI messages
    
    // Debug: Log all AI messages for analysis
    logger.info(`🔍 DEBUG: Total messages in context: ${contextHistory.length}`);
    logger.info(`🔍 DEBUG: AI messages found: ${recentAIMessages.length}`);
    recentAIMessages.forEach((msg, index) => {
      const hasEmoji = msg.content.includes('🙂') || msg.content.includes('🙏');
      logger.info(`🔍 DEBUG AI msg ${index + 1}: "${msg.content.substring(0, 50)}..." - Émoji: ${hasEmoji ? '✅' : '❌'}`);
    });
    
    const emojiCount = recentAIMessages.filter(msg => 
      msg.content.includes('🙂') || msg.content.includes('🙏')
    ).length;
    
    const shouldAvoidEmoji = emojiCount >= 1; // If any emoji in last 3 AI messages
    
    // Log emoji analysis
    logger.info(`😀 Analyse émojis: ${emojiCount}/${recentAIMessages.length} messages récents avec émojis`);
    if (shouldAvoidEmoji) {
      logger.info(`🚫 Éviter émoji dans cette réponse (règle 1/3)`);
    } else {
      logger.info(`✅ Émoji autorisé dans cette réponse`);
    }
    
    // Create enhanced system prompt with emoji context
    let enhancedSystemPrompt = currentAiConfig.systemPrompt;
    
    if (shouldAvoidEmoji) {
      enhancedSystemPrompt += `\n\n⚠️ IMPORTANT: Tu as utilisé ${emojiCount} émoji(s) dans tes 3 derniers messages. N'utilise AUCUN émoji dans cette réponse pour respecter la règle "1 message sur 3".`;
    } else {
      enhancedSystemPrompt += `\n\n✅ INFO: Tu peux utiliser 1 émoji (🙂 ou 🙏) dans cette réponse si approprié, mais pas obligatoire.`;
    }

    // Prepare messages for the API, including history
    const messages = [
      {
        role: "system",
        content: enhancedSystemPrompt
      },
      ...contextHistory.slice(-MAX_HISTORY_LENGTH) // Only the last N messages
    ];

    logger.info(`📤 Sending request to OpenAI with ${messages.length} messages`);

    // Call the API with a 30-second timeout
    const modelName = "grok-3-mini";
    const apiParams = getModelApiParams(modelName, {
      model: modelName,
      messages: messages,
      max_tokens: 1000,
      temperature: 0.7,
    });
    
    const completion = await Promise.race([
      openai.chat.completions.create(apiParams),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('30-second timeout exceeded')), 30000)
      )
    ]);

    const aiResponse = completion.choices[0].message.content;
    
    // Log reasoning content if available (Grok 3 Mini feature)
    const reasoningContent = completion.choices[0].message.reasoning_content;
    if (reasoningContent) {
      logger.info('🧠 Grok Reasoning:', reasoningContent);
    }
    
    // Log token usage including reasoning tokens
    if (completion.usage) {
      logger.info(`📊 Token usage - Total: ${completion.usage.total_tokens}, Completion: ${completion.usage.completion_tokens}`);
      if (completion.usage.completion_tokens_details?.reasoning_tokens) {
        logger.info(`🤔 Reasoning tokens: ${completion.usage.completion_tokens_details.reasoning_tokens}`);
      }
    }

    logger.ai.response(aiResponse);

    // Add the response to memory history for fallback
    const assistantMessage = {
      role: "assistant",
      content: aiResponse
    };
    
    memoryHistory.push(assistantMessage);

    // Limit memory history size
    if (memoryHistory.length > MAX_HISTORY_LENGTH * 2) {
      memoryHistory.splice(0, 2); // Remove the oldest messages
    }
    
    // Note: The AI response will be saved to database automatically 
    // by the message handling system when it's sent via WhatsApp

    // Vérifier si c'est un message de démo (simulateur) - pas de délai pour les tests
    const isDemoMode = from && from.includes('demo+');
    
    // If delays are enabled AND not in demo mode, calculate a realistic typing delay
    if (currentAiConfig.typingDelays && currentAiConfig.typingDelays.enabled && !isDemoMode) {
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
    } else if (isDemoMode) {
      logger.info(`🎭 Mode démo détecté - réponse instantanée`);
    }

    // If delays are disabled, return just the response
    return aiResponse;
  } catch (error) {
    logger.ai.error('Erreur lors de la génération:', error);
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
  loadConversationHistoryFromDB, // Export for external access to DB history
  MAX_HISTORY_LENGTH,
};
