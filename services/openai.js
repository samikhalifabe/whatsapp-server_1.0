const { openai, grokApiKey } = require('../config/ai');
const logger = require('../utils/logger');

// Function to check Grok connection
async function checkGrokConnection() {
  // Check if AI is enabled (requires API key)
  if (!grokApiKey) {
      return {
          success: false,
          message: "Grok API key is not configured. AI features are disabled."
      };
  }
  try {
    // Try a simple request to check if the API is accessible
    const completion = await openai.chat.completions.create({
      model: "grok-3-mini", // Using grok-3-mini for the connection test
      messages: [
        {
          role: "system",
          content: "Test de connexion"
        },
        {
          role: "user",
          content: "Test"
        }
      ],
      max_tokens: 5,
    });

    // If we reach here, the connection works
    logger.info('✅ Grok connection established successfully:', completion.model);
    return {
      success: true,
      model: completion.model,
      message: "Connexion Grok établie avec succès"
    };
  } catch (error) {
    logger.error('❌ Grok connection error:', error);
    return {
      success: false,
      error: error.message,
      message: "Erreur de connexion à Grok"
    };
  }
}

// Keep the old function name for backward compatibility
const checkOpenAIConnection = checkGrokConnection;

module.exports = {
  checkOpenAIConnection,
  checkGrokConnection,
};
