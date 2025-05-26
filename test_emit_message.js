const { io } = require('socket.io-client');

// Se connecter au serveur existant
const socket = io('http://localhost:3001');

// Simuler un message entrant
const testMessage = {
  id: 'test-message-' + Date.now(),
  message_id: 'test-whatsapp-' + Date.now(),
  from: '32488182452@c.us',
  to: 'me',
  body: 'Message de test émis depuis le client de test à ' + new Date().toLocaleTimeString(),
  timestamp: Date.now() / 1000,
  isFromMe: false,
  chatName: 'Test Chat 32488182452',
  chatId: '32488182452@c.us',
  conversation_id: '3a12a590-f4a1-4853-b4fa-761902ed7ce8', // ID pour 32488182452
  vehicle: null
};

socket.on('connect', () => {
  console.log('🔌 Connecté au serveur WebSocket pour le test');
  console.log('📤 Émission d\'un message de test...');
  console.log('📤 Message:', JSON.stringify(testMessage, null, 2));

  // Émettre le message vers le serveur
  socket.emit('test_new_message', testMessage);

  console.log('✅ Message émis avec succès!');

  // Fermer après 1 seconde
  setTimeout(() => {
    socket.disconnect();
    process.exit(0);
  }, 1000);
});

socket.on('connect_error', (error) => {
  console.error('❌ Erreur de connexion:', error);
  process.exit(1);
}); 