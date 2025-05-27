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
