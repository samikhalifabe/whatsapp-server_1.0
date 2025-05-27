const OpenAI = require('openai');
const logger = require('../utils/logger');
const { AUTOMOTIVE_PROMPT_TEMPLATES, selectOptimalTemplate } = require('./promptTemplates');

// Configuration de l'API OpenAI
const openaiApiKey = process.env.OPENAI_API_KEY;

if (!openaiApiKey) {
    logger.warn('WARNING: OPENAI_API_KEY environment variable is not set. AI features will be disabled.');
}

const openai = new OpenAI({
  apiKey: openaiApiKey,
});

// ===========================================
// SYSTÈME DE TEMPLATES DE PROMPTS SPÉCIALISÉS
// ===========================================

// Import des templates depuis le module dédié
const PROMPT_TEMPLATES = AUTOMOTIVE_PROMPT_TEMPLATES;

// ===========================================
// CONFIGURATION AVANCÉE DES PARAMÈTRES IA
// ===========================================

const AI_PARAMETERS = {
  // Modèles OpenAI disponibles
  models: {
    'gpt-4': {
      name: 'GPT-4',
      maxTokens: 4096,
      costPer1kTokens: 0.03,
      recommended: true
    },
    'gpt-4-turbo': {
      name: 'GPT-4 Turbo',
      maxTokens: 4096,
      costPer1kTokens: 0.01,
      recommended: true
    },
    'gpt-3.5-turbo': {
      name: 'GPT-3.5 Turbo',
      maxTokens: 4096,
      costPer1kTokens: 0.002,
      recommended: false
    }
  },

  // Paramètres de configuration flexibles
  defaults: {
    model: process.env.OPENAI_MODEL || 'gpt-4',
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7,
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 300,
    topP: parseFloat(process.env.OPENAI_TOP_P) || 0.9,
    frequencyPenalty: parseFloat(process.env.OPENAI_FREQUENCY_PENALTY) || 0.0,
    presencePenalty: parseFloat(process.env.OPENAI_PRESENCE_PENALTY) || 0.0,
    
    // Paramètres de retry et timeout
    maxRetries: parseInt(process.env.AI_MAX_RETRIES) || 3,
    timeoutMs: parseInt(process.env.AI_TIMEOUT_MS) || 30000,
    retryDelayMs: parseInt(process.env.AI_RETRY_DELAY_MS) || 1000,
    
    // Gestion de l'historique
    maxHistoryLength: parseInt(process.env.AI_MAX_HISTORY) || 15,
    historyContextWindow: parseInt(process.env.AI_HISTORY_WINDOW) || 10
  }
};

// Helper function to sanitize typing delay configurations
function sanitizeTypingDelays(sourceDelays, sourceUnitIsSeconds = false) {
  const defaults = {
    enabled: true,
    minDelayMs: 2000,
    maxDelayMs: 15000,
    wordsPerMinute: 40,
    randomizeDelay: true,
    showTypingIndicator: true
  };

  if (!sourceDelays || typeof sourceDelays !== 'object') {
    return {
      enabled: defaults.enabled,
      minDelay: defaults.minDelayMs,
      maxDelay: defaults.maxDelayMs,
      wordsPerMinute: defaults.wordsPerMinute,
      randomizeDelay: defaults.randomizeDelay,
      showTypingIndicator: defaults.showTypingIndicator,
    };
  }

  let minDelay, maxDelay;

  if (sourceUnitIsSeconds) {
    const parsedMinSec = parseFloat(sourceDelays.minDelay);
    minDelay = isNaN(parsedMinSec) || parsedMinSec < 0 ? defaults.minDelayMs : Math.round(parsedMinSec * 1000);

    const parsedMaxSec = parseFloat(sourceDelays.maxDelay);
    maxDelay = isNaN(parsedMaxSec) || parsedMaxSec < 0 ? defaults.maxDelayMs : Math.round(parsedMaxSec * 1000);
  } else {
    const parsedMinMs = parseInt(sourceDelays.minDelay);
    minDelay = isNaN(parsedMinMs) || parsedMinMs < 0 ? defaults.minDelayMs : parsedMinMs;

    const parsedMaxMs = parseInt(sourceDelays.maxDelay);
    maxDelay = isNaN(parsedMaxMs) || parsedMaxMs < 0 ? defaults.maxDelayMs : parsedMaxMs;
  }

  const MAX_SAFE_TIMEOUT = 2147483647;
  minDelay = Math.min(minDelay, MAX_SAFE_TIMEOUT);
  maxDelay = Math.min(maxDelay, MAX_SAFE_TIMEOUT);

  if (minDelay > maxDelay) {
    minDelay = maxDelay;
  }

  const parsedWPM = parseInt(sourceDelays.wordsPerMinute);
  const wpm = isNaN(parsedWPM) || parsedWPM <= 0 ? defaults.wordsPerMinute : parsedWPM;

  return {
    enabled: typeof sourceDelays.enabled === 'boolean' ? sourceDelays.enabled : defaults.enabled,
    minDelay: minDelay,
    maxDelay: maxDelay,
    wordsPerMinute: wpm,
    randomizeDelay: typeof sourceDelays.randomizeDelay === 'boolean' ? sourceDelays.randomizeDelay : defaults.randomizeDelay,
    showTypingIndicator: typeof sourceDelays.showTypingIndicator === 'boolean' ? sourceDelays.showTypingIndicator : defaults.showTypingIndicator,
  };
}

// ===========================================
// FONCTIONS DE GESTION DU CONTEXTE VÉHICULE
// ===========================================

/**
 * Génère le contexte véhicule pour les prompts
 */
function generateVehicleContext(vehicleInfo) {
  if (!vehicleInfo) {
    return "Aucune information spécifique sur le véhicule disponible.";
  }

  const context = [];
  
  if (vehicleInfo.make && vehicleInfo.model) {
    context.push(`Véhicule: ${vehicleInfo.make} ${vehicleInfo.model}`);
  }
  
  if (vehicleInfo.year) {
    context.push(`Année: ${vehicleInfo.year}`);
  }
  
  if (vehicleInfo.price) {
    context.push(`Prix: ${vehicleInfo.price}€`);
  }
  
  if (vehicleInfo.mileage) {
    context.push(`Kilométrage: ${vehicleInfo.mileage} km`);
  }
  
  if (vehicleInfo.fuelType) {
    context.push(`Carburant: ${vehicleInfo.fuelType}`);
  }
  
  if (vehicleInfo.transmission) {
    context.push(`Transmission: ${vehicleInfo.transmission}`);
  }
  
  if (vehicleInfo.description) {
    context.push(`Description: ${vehicleInfo.description}`);
  }
  
  return context.length > 0 ? context.join(', ') : "Informations véhicule non disponibles.";
}

/**
 * Détermine le template approprié basé sur le message
 */
function selectPromptTemplate(message, conversationHistory = []) {
  // Utiliser le système de sélection avancé
  return selectOptimalTemplate(message, conversationHistory);
}

// Configuration par défaut pour les réponses automatisées (maintient la compatibilité)
const defaultAiConfig = {
  enabled: !!openaiApiKey,
  respondToAll: false,
  keywords: ['assistance', 'aide', 'info', 'bonjour', 'salut', 'prix', 'véhicule', 'voiture'],
  systemPrompt: PROMPT_TEMPLATES.GENERAL_INQUIRY.systemPrompt,
  typingDelays: {
    enabled: true,
    minDelay: 2000,
    maxDelay: 15000,
    wordsPerMinute: 40,
    randomizeDelay: true,
    showTypingIndicator: true
  },
  unavailabilityKeywords: [
    "pas dispo", "non dispo", "n'est pas disponible", "n'est plus disponible",
    "plus dispo", "déjà vendu", "vendu", "il est vendu", "elle est vendue",
    "je l'ai vendu", "plus à vendre", "n'est plus à vendre"
  ],
  pauseBotOnPriceOffer: true,
  
  // Nouveaux paramètres avancés
  aiParameters: { ...AI_PARAMETERS.defaults },
  templateSystem: {
    enabled: true,
    autoSelect: true,
    fallbackTemplate: 'GENERAL_INQUIRY'
  }
};

module.exports = {
  openai,
  openaiApiKey,
  sanitizeTypingDelays,
  defaultAiConfig,
  
  // Nouvelles exportations
  PROMPT_TEMPLATES,
  AI_PARAMETERS,
  generateVehicleContext,
  selectPromptTemplate
};
