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
const { handleIncomingMessage } = require('../handlers/messageHandler'); // Import the new handler

let qrCodeData = '';
let whatsappClient = null;
let socketIo = null; // Store the Socket.IO instance

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
  // handleIncomingMessage // Will be exported or called internally later
};
