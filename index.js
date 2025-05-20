require('dotenv').config(); // Load environment variables
const { app, server, io, PORT } = require('./config/server');
const { initializeWhatsAppClient } = require('./services/whatsapp');
const { loadAIConfigFromDB } = require('./services/aiResponse');
const errorHandler = require('./middleware/errorHandler');
const routes = require('./routes');
const logger = require('./utils/logger');

async function startServer() {
  try {
    // Middleware for parsing JSON and CORS are already configured in config/server.js
    // app.use(express.json());
    // app.use(cors(...));

    // Mount the main router
    app.use('/api', routes);

    // Apply the error handling middleware
    app.use(errorHandler);

    // Initialiser le client WhatsApp
    // Pass the Socket.IO instance to the WhatsApp service
    await initializeWhatsAppClient(io);

    // Charger la configuration AI depuis la base de données
    await loadAIConfigFromDB();

    // Démarrer le serveur
    server.listen(PORT, '0.0.0.0', () => {
      logger.info(`Server started on http://localhost:${PORT}`);
      logger.info(`WebSocket available on ws://localhost:${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
