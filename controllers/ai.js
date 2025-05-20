const { checkOpenAIConnection } = require('../services/openai');
const { getAiConfig, updateAiConfig, generateAIResponseWithHistory } = require('../services/aiResponse');
const logger = require('../utils/logger');

// Endpoint to check OpenAI connection
const getOpenAIStatus = async (req, res) => {
  try {
    const connectionTest = await checkOpenAIConnection();
    if (connectionTest.success) {
      res.json({
        status: 'connected',
        message: connectionTest.message,
        model: connectionTest.model
      });
    } else {
      res.status(503).json({
        status: 'disconnected',
        message: connectionTest.message,
        error: connectionTest.error
      });
    }
  } catch (error) {
    logger.error('Error checking OpenAI connection:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error checking connection',
      error: error.message
    });
  }
};

// Endpoint to test AI response generation
const testAiResponse = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    logger.info('Testing AI generation with message:', message);

    // Generate a response using the AI response service
    // Using a dummy 'from' number for testing history
    const aiResponse = await generateAIResponseWithHistory('test-user', message);

    res.json({
      success: true,
      response: aiResponse,
      formatted: typeof aiResponse === 'object' ? aiResponse.text : aiResponse
    });
  } catch (error) {
    logger.error('Exception during AI generation test:', error);
    res.status(500).json({
      error: 'Server error during AI generation test',
      details: error.message
    });
  }
};

// Endpoint to retrieve AI configuration
const getAiConfiguration = (req, res) => {
  try {
    const config = getAiConfig();
    res.json({
      success: true,
      config: config
    });
  } catch (error) {
    logger.error('Exception retrieving AI configuration:', error);
    res.status(500).json({
      error: 'Server error retrieving configuration',
      details: error.message
    });
  }
};

// Endpoint to update AI configuration
const updateAiConfiguration = async (req, res) => {
  try {
    const newConfig = req.body;

    // Basic validation (can be expanded)
    if (typeof newConfig.enabled !== 'boolean' ||
        typeof newConfig.respondToAll !== 'boolean' ||
        !Array.isArray(newConfig.keywords) ||
        typeof newConfig.systemPrompt !== 'string' ||
        !newConfig.typingDelays ||
        !Array.isArray(newConfig.unavailabilityKeywords) ||
        typeof newConfig.pauseBotOnPriceOffer !== 'boolean'
       ) {
      return res.status(400).json({ error: 'Invalid data format' });
    }

    // Update the configuration using the AI response service
    const saved = await updateAiConfig(newConfig);

    if (saved) {
      res.json({
        success: true,
        message: 'Configuration saved successfully',
        config: getAiConfig() // Return the updated config
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Error saving configuration to database',
        config: getAiConfig() // Return current config even if save failed
      });
    }
  } catch (error) {
    logger.error('Exception updating AI configuration:', error);
    res.status(500).json({
      error: 'Server error updating configuration',
      details: error.message
    });
  }
};


module.exports = {
  getOpenAIStatus,
  testAiResponse,
  getAiConfiguration,
  updateAiConfiguration,
};
