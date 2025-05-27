const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { getPuppeteerOptions, getSessionDirectory } = require('../config/puppeteer');
// We will need to import functions from models and other services later
// const { findOrCreateConversation, updateConversationState } = require('../models/conversation');
// const { saveMessage } = require('../models/message');
// const { updateVehicleContactStatus, isVehicleUnavailableResponse } = require('../models/vehicle');
// const { detectPriceOffer, createPriceOfferInDB } = require('../models/priceoffer');
// const { shouldAutoRespond, generateAIResponseWithHistory } = require('./aiResponse');
const { normalizePhoneNumber } = require('../utils/phoneNumber');
const logger = require('../utils/logger');
const { handleIncomingMessage, handleOutgoingMessage } = require('../handlers/messageHandler'); // Import the new handler

let qrCodeData = '';
let whatsappClient = null;
let socketIo = null;

// Tracker pour les messages envoyés via l'API (pour éviter la duplication)
let recentApiMessages = [];

function addApiMessage(to, body) {
  const message = {
    to,
    body,
    timestamp: Date.now()
  };
  recentApiMessages.push(message);
  
  // Nettoyer les anciens messages (garder seulement les 2 dernières minutes)
  const twoMinutesAgo = Date.now() - (2 * 60 * 1000);
  recentApiMessages = recentApiMessages.filter(msg => msg.timestamp > twoMinutesAgo);
}

function getRecentApiMessages() {
  // Nettoyer les anciens messages à chaque appel
  const twoMinutesAgo = Date.now() - (2 * 60 * 1000);
  recentApiMessages = recentApiMessages.filter(msg => msg.timestamp > twoMinutesAgo);
  return recentApiMessages;
} // Store the Socket.IO instance

async function initializeWhatsAppClient(io) {
  socketIo = io; // Store the Socket.IO instance

  // Configuration du client WhatsApp
  const puppeteerOptions = getPuppeteerOptions();
  const sessionDirectory = getSessionDirectory();

  // Ensure session directory exists
  const fs = require('fs');
  const path = require('path');
  if (!fs.existsSync(sessionDirectory)) {
      try {
          fs.mkdirSync(sessionDirectory, { recursive: true });
          logger.info(`Created session directory: ${sessionDirectory}`);
      } catch (err) {
          logger.error(`Failed to create session directory ${sessionDirectory}: ${err.message}`);
      }
  }

  whatsappClient = new Client({
    authStrategy: new LocalAuth({
      clientId: "whatsapp-api",
      dataPath: sessionDirectory
    }),
    puppeteer: puppeteerOptions
  });

  // Gestionnaire d'événement QR code
  whatsappClient.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    qrCodeData = qr;
    logger.info('New QR code generated. Scan it with WhatsApp on your phone.');
    if (socketIo) {
      socketIo.emit('qr_code_updated', { qrcode: qr });
    }
  });

  // Gestionnaire d'événement ready
  whatsappClient.on('ready', () => {
    logger.info('WhatsApp client is ready!');
    logger.info('Client Info on Ready:', whatsappClient.info);
    if (socketIo) {
      socketIo.emit('whatsapp_status_change', { status: 'connected', info: whatsappClient.info });
    }
  });

  // Gestionnaire d'événement authenticated
  whatsappClient.on('authenticated', (session) => {
      logger.info('WhatsApp client authenticated!');
      // Session information is automatically saved by LocalAuth
  });

  // Gestionnaire d'événement auth_failure
  whatsappClient.on('auth_failure', msg => {
      logger.error('AUTHENTICATION FAILURE', msg);
      if (socketIo) {
        socketIo.emit('whatsapp_status_change', { status: 'auth_failure', message: msg });
      }
      // Consider restarting or prompting for re-authentication
  });

  // Gestionnaire d'événement disconnected
  whatsappClient.on('disconnected', (reason) => {
      logger.info('WhatsApp client disconnected:', reason);
      if (socketIo) {
        socketIo.emit('whatsapp_status_change', { status: 'disconnected', reason: reason });
      }
      // Consider restarting the client
      // client.initialize(); // Auto-reconnect attempt
  });

  // Gestionnaire de messages entrants
  whatsappClient.on('message', async (msg) => {
    // Call the dedicated message handler, passing the client instance
    await handleIncomingMessage(msg, whatsappClient);
  });

  // Gestionnaire pour TOUS les messages (entrants ET sortants)
  whatsappClient.on('message_create', async (msg) => {
    // Ignorer les messages de statut et les messages système
    if (msg.type === 'e2e_notification' || msg.type === 'notification_template') {
      return;
    }

    // IGNORER les messages entrants (déjà gérés par l'événement 'message')
    if (!msg.fromMe) {
      return;
    }

    // Si c'est un message sortant (que vous avez envoyé depuis WhatsApp Web/téléphone)
    if (msg.fromMe && msg.to !== 'status@broadcast') {
      // VÉRIFIER SI LE MESSAGE A ÉTÉ ENVOYÉ VIA L'API
      // Si le message a été envoyé dans les 30 dernières secondes via sendWhatsAppMessage,
      // alors ne pas le traiter ici pour éviter la duplication
      const recentApiMessages = getRecentApiMessages();
      const isFromApi = recentApiMessages.some(apiMsg => {
        const timeDiff = Math.abs(apiMsg.timestamp - (msg.timestamp * 1000));
        const sameRecipient = apiMsg.to === msg.to;
        const sameContent = apiMsg.body === msg.body;
        
        logger.debug(`Checking API message: timeDiff=${timeDiff}ms, sameRecipient=${sameRecipient}, sameContent=${sameContent}`);
        
        return timeDiff < 30000 && sameRecipient && sameContent; // 30 secondes
      });
      
      if (!isFromApi) {
        logger.info('Outgoing message detected from WhatsApp Web/Phone:', msg.body);
        await handleOutgoingMessage(msg, whatsappClient);
      } else {
        logger.info('Outgoing message ignored (sent via API):', msg.body);
      }
    }
    // Les messages entrants sont déjà gérés par l'événement 'message'
  });

  // Initialiser le client
  await whatsappClient.initialize();

  return whatsappClient;
}

// Function to send a WhatsApp message
async function sendWhatsAppMessage(to, message, vehicleId, userId) {
  if (!whatsappClient || !whatsappClient.info) {
    throw new Error('WhatsApp client is not ready');
  }

  if (!to || !message) {
    throw new Error('Recipient and message are required');
  }

  // Format the number for WhatsApp
  const chatId = normalizePhoneNumber(to).includes('@c.us') ? normalizePhoneNumber(to) : `${normalizePhoneNumber(to)}@c.us`;

  logger.info(`Attempting to send message to ${chatId}: "${message}"`);
  
  // Enregistrer le message dans le tracker AVANT l'envoi
  addApiMessage(chatId, message);
  
  // Send the message via WhatsApp
  const sentMessage = await whatsappClient.sendMessage(chatId, message);
  logger.info('Message sent via WhatsApp client. Result:', sentMessage);

  // We will save this message to DB and emit via WebSocket later
  // when we have access to Supabase service and Socket.IO instance

  return sentMessage;
}

// Function to get WhatsApp status
function getWhatsAppStatus() {
  return {
    status: whatsappClient && whatsappClient.info ? 'connected' : 'disconnected',
    info: whatsappClient ? whatsappClient.info : null
  };
}

// Function to get QR code
function getQRCode() {
  return qrCodeData;
}

// Exporter les fonctions nécessaires
module.exports = {
  initializeWhatsAppClient,
  getWhatsAppClient: () => whatsappClient,
  getQRCode,
  getWhatsAppStatus,
  sendWhatsAppMessage,
  addApiMessage,
  getRecentApiMessages
  // handleIncomingMessage // Will be exported or called internally later
};
