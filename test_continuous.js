const io = require('socket.io-client');

console.log('🔌 Test continu de WebSocket...');

const socket = io('http://localhost:3001');

socket.on('connect', () => {
  console.log('✅ Connexion WebSocket établie!');
  console.log('🆔 Socket ID:', socket.id);
});

socket.on('welcome', (data) => {
  console.log('👋 Message de bienvenue:', data);
});

socket.on('new_message', (message) => {
  console.log('📩 NOUVEAU MESSAGE REÇU:');
  console.log('📩 ID:', message.id);
  console.log('📩 From:', message.from);
  console.log('📩 Body:', message.body);
  console.log('📩 Conversation ID:', message.conversation_id);
  console.log('📩 Timestamp:', new Date(message.timestamp * 1000).toLocaleString());
  console.log('📩 IsFromMe:', message.isFromMe);
  console.log('---');
});

socket.on('disconnect', () => {
  console.log('❌ Connexion fermée');
});

socket.on('connect_error', (error) => {
  console.log('❌ Erreur de connexion:', error);
});

console.log('👂 En écoute des messages... (Ctrl+C pour arrêter)');

// Garder le script en vie
process.on('SIGINT', () => {
  console.log('\n🔚 Arrêt du test');
  socket.disconnect();
  process.exit(0);
}); 