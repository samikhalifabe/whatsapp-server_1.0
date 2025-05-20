const { openai, openaiApiKey } = require('../config/ai');
const logger = require('../utils/logger');

// Function to check OpenAI connection
async function checkOpenAIConnection() {
  // Check if AI is enabled (requires API key)
  if (!openaiApiKey) {
      return {
          success: false,
          message: "OpenAI API key is not configured. AI features are disabled."
      };
  }
  try {
    // Try a simple request to check if the API is accessible
    const completion = await openai.chat.completions.create({
      model: "gpt-4o", // Using gpt-4o for the connection test as it's a capable model
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
    logger.info('✅ OpenAI connection established successfully:', completion.model);
    return {
      success: true,
      model: completion.model,
      message: "Connexion OpenAI établie avec succès"
    };
  } catch (error) {
    logger.error('❌ OpenAI connection error:', error);
    return {
      success: false,
      error: error.message,
      message: "Erreur de connexion à OpenAI"
    };
  }
}

module.exports = {
  checkOpenAIConnection,
};
