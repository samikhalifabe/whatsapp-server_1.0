const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const logger = require('../utils/logger'); // Assuming a logger utility will be created

const PORT = process.env.PORT || 3001;

// Initialiser l'application Express
const app = express();

// Créer le serveur HTTP
const server = http.createServer(app);

// Configuration CORS plus permissive
const corsOptions = {
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  methods: ['GET', 'POST', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));

// Middleware pour parser le JSON
app.use(express.json());

// Servir l'interface web de démo
app.get('/demo', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'demo_web_interface.html'));
});

// Servir la nouvelle interface démo moderne
app.get('/demo-modern', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'demo_web_interface_modern.html'));
});

// Endpoint API pour simuler des messages (pour l'interface web)
app.post('/api/simulate-message', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message requis' });
    }
    
    logger.info(`[API] 📨 Simulation de message reçue: "${message}"`);
    
    // Importer dynamiquement le simulateur pour éviter les dépendances circulaires
    const { simulateIncomingMessage } = require('../simulate_conversation');
    
    // Simuler le message entrant
    await simulateIncomingMessage(message);
    
    res.json({ 
      success: true, 
      message: 'Message simulé avec succès',
      sentMessage: message
    });
    
  } catch (error) {
    logger.error('[API] ❌ Erreur simulation message:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la simulation du message',
      details: error.message 
    });
  }
});

// Endpoint pour récupérer l'état de la conversation de démo
app.get('/api/demo-conversation-state', async (req, res) => {
  try {
    const { supabase } = require('../services/database');
    const { normalizePhoneNumber } = require('../utils/phoneNumber');
    
    const demoPhoneNumber = normalizePhoneNumber('demo+33123456789@c.us');
    
    logger.info(`[API] 📊 Récupération état conversation démo: ${demoPhoneNumber}`);
    
    // Chercher la conversation de démo
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('id, phone_number, state, detected_price, vehicle_id, created_at, last_message_at')
      .eq('phone_number', demoPhoneNumber)
      .limit(1);
    
    if (error) {
      logger.error('[API] ❌ Erreur récupération conversation démo:', error);
      return res.status(500).json({ error: 'Erreur lors de la récupération de la conversation' });
    }
    
    if (!conversations || conversations.length === 0) {
      return res.json({
        exists: false,
        state: null,
        detectedPrice: null,
        message: 'Conversation de démo non trouvée'
      });
    }
    
    const conversation = conversations[0];
    
    res.json({
      exists: true,
      conversationId: conversation.id,
      state: conversation.state,
      detectedPrice: conversation.detected_price,
      vehicleId: conversation.vehicle_id,
      createdAt: conversation.created_at,
      lastMessageAt: conversation.last_message_at
    });
    
  } catch (error) {
    logger.error('[API] ❌ Exception récupération état démo:', error);
    res.status(500).json({ 
      error: 'Erreur serveur lors de la récupération de l\'état',
      details: error.message 
    });
  }
});

// Endpoint pour modifier l'état de la conversation de démo
app.patch('/api/demo-conversation-state', async (req, res) => {
  try {
    const { newState } = req.body;
    
    if (!newState || typeof newState !== 'string') {
      return res.status(400).json({ error: 'Nouvel état requis' });
    }
    
    // Valider l'état
    const validStates = ['active', 'negotiation', 'completed', 'archived'];
    if (!validStates.includes(newState)) {
      return res.status(400).json({ 
        error: 'État invalide', 
        validStates: validStates 
      });
    }
    
    const { supabase } = require('../services/database');
    const { normalizePhoneNumber } = require('../utils/phoneNumber');
    
    const demoPhoneNumber = normalizePhoneNumber('demo+33123456789@c.us');
    
    logger.info(`[API] 🔄 Changement état conversation démo: ${demoPhoneNumber} -> ${newState}`);
    
    // Mettre à jour l'état de la conversation de démo
    const { data, error } = await supabase
      .from('conversations')
      .update({
        state: newState,
        last_state_change: new Date().toISOString(),
        state_change_reason: 'Manuel via interface démo'
      })
      .eq('phone_number', demoPhoneNumber)
      .select()
      .single();
    
    if (error) {
      logger.error('[API] ❌ Erreur mise à jour état démo:', error);
      return res.status(500).json({ error: 'Erreur lors de la mise à jour de l\'état' });
    }
    
    if (!data) {
      return res.status(404).json({ error: 'Conversation de démo non trouvée' });
    }
    
    logger.info(`[API] ✅ État conversation démo mis à jour: ${newState}`);
    
    res.json({
      success: true,
      conversationId: data.id,
      previousState: data.state,
      newState: newState,
      updatedAt: data.last_state_change
    });
    
  } catch (error) {
    logger.error('[API] ❌ Exception mise à jour état démo:', error);
    res.status(500).json({ 
      error: 'Erreur serveur lors de la mise à jour de l\'état',
      details: error.message 
    });
  }
});

// Endpoint pour reset complet de la conversation de démo
app.delete('/api/demo-conversation-reset', async (req, res) => {
  try {
    const { supabase } = require('../services/database');
    const { normalizePhoneNumber } = require('../utils/phoneNumber');
    
    const demoPhoneNumber = normalizePhoneNumber('demo+33123456789@c.us');
    
    logger.info(`[API] 🔄 Reset complet conversation démo: ${demoPhoneNumber}`);
    
    // 1. Récupérer l'ID de la conversation de démo
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .eq('phone_number', demoPhoneNumber)
      .single();
    
    if (convError && convError.code !== 'PGRST116') { // PGRST116 = pas trouvé
      logger.error('[API] ❌ Erreur récupération conversation démo:', convError);
      return res.status(500).json({ error: 'Erreur lors de la récupération de la conversation' });
    }
    
    if (!conversation) {
      return res.json({
        success: true,
        message: 'Aucune conversation de démo à reset',
        deleted: {
          conversation: false,
          messages: 0,
          priceOffers: 0
        }
      });
    }
    
    const conversationId = conversation.id;
    let deletedMessages = 0;
    let deletedPriceOffers = 0;
    
    // 2. Supprimer les offres de prix liées
    const { data: deletedOffers, error: offersError } = await supabase
      .from('price_offers')
      .delete()
      .eq('conversation_id', conversationId)
      .select('id');
    
    if (offersError) {
      logger.error('[API] ❌ Erreur suppression offres prix:', offersError);
    } else {
      deletedPriceOffers = deletedOffers?.length || 0;
      logger.info(`[API] 🗑️ ${deletedPriceOffers} offres de prix supprimées`);
    }
    
    // 3. Supprimer tous les messages de la conversation
    const { data: deletedMsgs, error: messagesError } = await supabase
      .from('messages')
      .delete()
      .eq('conversation_id', conversationId)
      .select('id');
    
    if (messagesError) {
      logger.error('[API] ❌ Erreur suppression messages:', messagesError);
    } else {
      deletedMessages = deletedMsgs?.length || 0;
      logger.info(`[API] 🗑️ ${deletedMessages} messages supprimés`);
    }
    
    // 4. Reset la conversation (garder la conversation mais reset les données)
    const { error: resetError } = await supabase
      .from('conversations')
      .update({
        state: 'active',
        last_message_at: new Date().toISOString(),
        last_state_change: new Date().toISOString(),
        state_change_reason: 'Reset démo',
        detected_price: null,
        price_detected_at: null,
        price_detected_message_id: null
      })
      .eq('id', conversationId);
    
    if (resetError) {
      logger.error('[API] ❌ Erreur reset conversation:', resetError);
      return res.status(500).json({ error: 'Erreur lors du reset de la conversation' });
    }
    
    logger.info(`[API] ✅ Conversation démo resetée: ${deletedMessages} messages, ${deletedPriceOffers} offres supprimées`);
    
    res.json({
      success: true,
      message: 'Conversation de démo resetée avec succès',
      deleted: {
        conversation: true,
        messages: deletedMessages,
        priceOffers: deletedPriceOffers
      },
      resetAt: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('[API] ❌ Exception reset démo:', error);
    res.status(500).json({ 
      error: 'Erreur serveur lors du reset',
      details: error.message 
    });
  }
});

// Initialiser Socket.IO avec la même configuration CORS
const io = new Server(server, {
  cors: corsOptions,
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// Configuration des WebSockets
io.on('connection', (socket) => {
  logger.info('Nouvelle connexion WebSocket établie:', socket.id);

  // Envoyer un message de bienvenue
  socket.emit('welcome', { message: 'Connexion WebSocket établie avec succès' });

  // Handler pour les messages de test
  socket.on('test_new_message', (message) => {
    logger.info('📤 Message de test reçu, rediffusion à tous les clients...');
    logger.info('📤 Message:', JSON.stringify(message, null, 2));
    
    // Rediffuser le message à tous les clients connectés
    io.emit('new_message', message);
    
    logger.info('✅ Message de test rediffusé avec succès!');
  });

  // Gérer la déconnexion
  socket.on('disconnect', () => {
    logger.info('Client déconnecté:', socket.id);
  });

  // Gérer les erreurs
  socket.on('error', (error) => {
    logger.error('Erreur WebSocket:', error);
  });
});

module.exports = {
  app,
  server,
  io,
  PORT,
};
