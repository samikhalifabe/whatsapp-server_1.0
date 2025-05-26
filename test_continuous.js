const { io } = require('socket.io-client');

console.log('🔌 Connexion au serveur WebSocket pour monitoring continu...');
const socket = io('http://localhost:3001');

socket.on('connect', () => {
  console.log('✅ Connecté au serveur WebSocket!');
  console.log('🆔 Socket ID:', socket.id);
  console.log('🎯 En écoute des messages WebSocket...');
  console.log('───────────────────────────────────────');
});

socket.on('disconnect', () => {
  console.log('❌ Déconnecté du serveur WebSocket');
});

socket.on('connect_error', (error) => {
  console.error('❌ Erreur de connexion WebSocket:', error);
});

socket.on('new_message', (message) => {
  console.log('🔔 NOUVEAU MESSAGE REÇU VIA WEBSOCKET:');
  console.log('   ⏰ Timestamp:', new Date().toLocaleTimeString());
  console.log('   📝 Type:', typeof message);
  console.log('   🆔 ID:', message.id);
  console.log('   📱 From:', message.from);
  console.log('   💬 Body:', message.body);
  console.log('   🗂️ Conversation ID:', message.conversation_id);
  console.log('   👤 IsFromMe:', message.isFromMe);
  console.log('   📅 Message Timestamp:', new Date(message.timestamp * 1000).toLocaleString());
  console.log('   🏷️ Chat Name:', message.chatName);
  console.log('   🆔 Chat ID:', message.chatId);
  console.log('');
  console.log('   📋 Message complet:', JSON.stringify(message, null, 2));
  console.log('───────────────────────────────────────');
});

socket.on('price_offer_detected', (data) => {
  console.log('💰 OFFRE DE PRIX DÉTECTÉE:');
  console.log('   💵 Prix:', data.price, data.currency);
  console.log('   🗂️ Conversation:', data.conversationId);
  console.log('   📱 Contact:', data.contactNumber);
  console.log('   💬 Message:', data.messageBody);
  console.log('───────────────────────────────────────');
});

socket.on('test_new_message', (message) => {
  console.log('🧪 MESSAGE DE TEST REÇU:');
  console.log('   💬 Body:', message.body);
  console.log('   📱 From:', message.from);
  console.log('───────────────────────────────────────');
});

console.log('💡 Pour arrêter le monitoring, appuyez sur Ctrl+C');
console.log('📱 Envoyez maintenant un message WhatsApp pour tester...');

// Garder le script en vie
process.on('SIGINT', () => {
  console.log('\n🔚 Arrêt du test');
  socket.disconnect();
  process.exit(0);
}); 