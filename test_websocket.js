const io = require('socket.io-client');

console.log('🔌 Test de connexion WebSocket...');

const socket = io('http://localhost:3001');

socket.on('connect', () => {
  console.log('✅ Connexion WebSocket établie avec succès!');
  console.log('Socket ID:', socket.id);
  
  // Simuler un message entrant pour tester
  console.log('📤 Simulation d\'un message entrant...');
  
  // Créer un message de test au format attendu
  const testMessage = {
    id: 'test-message-id',
    message_id: 'test-whatsapp-id',
    from: '32123456789@c.us',
    to: 'me',
    body: 'Test message from WebSocket',
    timestamp: Date.now() / 1000,
    isFromMe: false,
    chatName: 'Test Chat',
    chatId: 'test-chat-id',
    conversation_id: 'test-conversation-uuid',
    vehicle: null
  };
  
  // Émettre le message de test après 2 secondes
  setTimeout(() => {
    console.log('📤 Émission du message de test...');
    socket.emit('test_message', testMessage);
  }, 2000);
});

socket.on('welcome', (data) => {
  console.log('📨 Message de bienvenue reçu:', data);
});

socket.on('new_message', (message) => {
  console.log('📩 Nouveau message reçu via WebSocket:');
  console.log('Type:', typeof message);
  console.log('Contenu:', JSON.stringify(message, null, 2));
  
  // Vérifier les propriétés importantes
  console.log('🔍 Analyse du message:');
  console.log('- ID:', message.id);
  console.log('- From:', message.from);
  console.log('- Body:', message.body);
  console.log('- Conversation ID:', message.conversation_id);
  console.log('- IsFromMe:', message.isFromMe);
});

socket.on('disconnect', () => {
  console.log('❌ Connexion WebSocket fermée');
});

socket.on('connect_error', (error) => {
  console.log('❌ Erreur de connexion WebSocket:', error);
});

// Garder le script en vie pendant 15 secondes
setTimeout(() => {
  console.log('🔚 Fermeture du test');
  socket.disconnect();
  process.exit(0);
}, 15000); 