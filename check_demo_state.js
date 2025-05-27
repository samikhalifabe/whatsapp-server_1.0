const { supabase } = require('./services/database');
const { normalizePhoneNumber } = require('./utils/phoneNumber');

async function checkDemoState() {
  const demoPhoneNumber = normalizePhoneNumber('demo+33123456789@c.us');
  
  console.log('🔍 Vérification état conversation de démo...');
  console.log(`📱 Numéro: ${demoPhoneNumber}`);
  
  try {
    // 1. Vérifier la conversation
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('phone_number', demoPhoneNumber)
      .single();
    
    if (convError) {
      console.log('❌ Aucune conversation de démo trouvée');
      return;
    }
    
    console.log('\n📊 CONVERSATION:');
    console.log(`├── ID: ${conversation.id}`);
    console.log(`├── État: ${conversation.state}`);
    console.log(`├── Prix détecté: ${conversation.detected_price}€`);
    console.log(`├── Dernière activité: ${conversation.last_message_at}`);
    console.log(`└── Raison changement état: ${conversation.state_change_reason}`);
    
    // 2. Compter les messages
    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select('id, body, is_from_me, timestamp')
      .eq('conversation_id', conversation.id)
      .order('timestamp', { ascending: true });
    
    if (!msgError && messages) {
      console.log(`\n💬 MESSAGES (${messages.length}):`);
      messages.forEach((msg, index) => {
        const sender = msg.is_from_me ? 'IA' : 'User';
        const body = msg.body.length > 50 ? msg.body.substring(0, 50) + '...' : msg.body;
        console.log(`├── ${index + 1}. [${sender}] "${body}"`);
      });
    }
    
    // 3. Compter les offres de prix
    const { data: offers, error: offerError } = await supabase
      .from('price_offers')
      .select('id, offered_price, offer_currency, status, notes')
      .eq('conversation_id', conversation.id);
    
    if (!offerError && offers) {
      console.log(`\n💰 OFFRES DE PRIX (${offers.length}):`);
      offers.forEach((offer, index) => {
        console.log(`├── ${index + 1}. ${offer.offered_price} ${offer.offer_currency} (${offer.status})`);
        console.log(`└────── Notes: ${offer.notes}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Erreur:', error);
  }
  
  console.log('\n' + '='.repeat(60));
}

// Exécuter si appelé directement
if (require.main === module) {
  checkDemoState().then(() => {
    console.log('✅ Vérification terminée');
    process.exit(0);
  });
}

module.exports = { checkDemoState }; 