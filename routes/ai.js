const express = require('express');
const router = express.Router();
const aiController = require('../controllers/ai');

// Routes for AI
router.get('/status', aiController.getOpenAIStatus);
router.post('/test', aiController.testAiResponse);
router.get('/config', aiController.getAiConfiguration);
router.post('/config', aiController.updateAiConfiguration);

module.exports = router;
