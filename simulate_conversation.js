const { findOrCreateConversation } = require('./models/conversation');
const { handleIncomingMessage } = require('./handlers/messageHandler');
const logger = require('./utils/logger');

// Configuration du simulateur
const DEMO_CONFIG = {
  phoneNumber: 'demo+33123456789@c.us', // Numéro fictif pour la démo
  chatName: 'Démo IA - Test Client',
  userId: 'demo-user-123' // ID utilisateur fictif
};

// Simulateur de client WhatsApp (pour remplacer whatsappClient)
const mockWhatsAppClient = {
  sendMessage: async (to, message) => {
    logger.info(`[DEMO] 🤖 Réponse IA simulée envoyée à ${to}: "${message}"`);
    
    // Simuler un message envoyé avec un ID fictif
    const mockSentMessage = {
      id: {
        _serialized: `demo_ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }
    };
    
    return mockSentMessage;
  },
  
  info: {
    wid: 'demo_bot@c.us'
  }
};

// Fonction pour simuler un message entrant
async function simulateIncomingMessage(messageText) {
  logger.section('SIMULATION MESSAGE ENTRANT');
  logger.info(`[DEMO] 📱 Simulation message de ${DEMO_CONFIG.phoneNumber}: "${messageText}"`);
  
  // Créer un objet message fictif au format WhatsApp
  const mockMessage = {
    id: {
      _serialized: `demo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    },
    from: DEMO_CONFIG.phoneNumber,
    to: 'demo_bot@c.us',
    body: messageText,
    timestamp: Math.floor(Date.now() / 1000),
    type: 'chat'
  };
  
  try {
    // Traiter le message avec le handler existant
    await handleIncomingMessage(mockMessage, mockWhatsAppClient);
    logger.info(`[DEMO] ✅ Message traité avec succès`);
  } catch (error) {
    logger.error(`[DEMO] ❌ Erreur lors du traitement:`, error);
  }
}

// Interface de conversation interactive
async function startInteractiveDemo() {
  const readline = require('readline');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  console.log('\n🎭 === SIMULATEUR DE CONVERSATION IA ===');
  console.log(`📱 Numéro fictif: ${DEMO_CONFIG.phoneNumber}`);
  console.log(`🤖 Bot: demo_bot@c.us`);
  console.log('\n💡 Instructions:');
  console.log('   - Tapez votre message et appuyez sur Entrée');
  console.log('   - Tapez "quit" pour quitter');
  console.log('   - Tapez "help" pour afficher les commandes');
  console.log('\n🚀 Démarrage de la conversation...\n');
  
  const askQuestion = () => {
    rl.question('👤 Vous: ', async (answer) => {
      if (answer.toLowerCase() === 'quit') {
        console.log('\n👋 Fin de la simulation');
        rl.close();
        process.exit(0);
      } else if (answer.toLowerCase() === 'help') {
        console.log('\n📋 Commandes disponibles:');
        console.log('   quit   - Quitter le simulateur');
        console.log('   help   - Afficher cette aide');
        console.log('   clear  - Effacer l\'écran');
        console.log('\n');
        askQuestion();
      } else if (answer.toLowerCase() === 'clear') {
        console.clear();
        console.log('🎭 === SIMULATEUR DE CONVERSATION IA ===\n');
        askQuestion();
      } else if (answer.trim()) {
        await simulateIncomingMessage(answer.trim());
        console.log(''); // Ligne vide pour la lisibilité
        askQuestion();
      } else {
        askQuestion();
      }
    });
  };
  
  askQuestion();
}

// Fonction pour des scénarios prédéfinis
async function runPredefinedScenario(scenarioName = 'default') {
  const scenarios = {
    default: [
      'Bonjour',
      'Je suis intéressé par votre véhicule',
      'Quel est le prix ?',
      'C\'est un peu cher, vous pouvez faire un effort ?',
      '15000 euros ça vous va ?'
    ],
    
    negotiation: [
      'Salut',
      'Votre voiture est toujours dispo ?',
      'Je peux la voir quand ?',
      'Je vous propose 12000€ cash',
      'Allez, 13000€ et on signe maintenant'
    ],
    
    quick: [
      'Hello',
      'Prix final ?',
      '10000€'
    ]
  };
  
  const messages = scenarios[scenarioName] || scenarios.default;
  
  logger.section(`SCÉNARIO PRÉDÉFINI: ${scenarioName.toUpperCase()}`);
  
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    console.log(`\n📨 Message ${i + 1}/${messages.length}: "${message}"`);
    
    await simulateIncomingMessage(message);
    
    // Attendre un peu entre les messages pour laisser l'IA traiter
    if (i < messages.length - 1) {
      console.log('⏳ Attente avant le prochain message...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log('\n✅ Scénario terminé !');
}

// Point d'entrée principal
async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'interactive';
  const scenario = args[1] || 'default';
  
  console.log('🎭 Démarrage du simulateur de conversation...');
  
  // Vérifier que la conversation de démo existe
  try {
    await findOrCreateConversation(DEMO_CONFIG.phoneNumber);
    logger.info(`[DEMO] ✅ Conversation de démo initialisée`);
  } catch (error) {
    logger.error(`[DEMO] ❌ Erreur initialisation conversation:`, error);
    process.exit(1);
  }
  
  if (mode === 'interactive') {
    await startInteractiveDemo();
  } else if (mode === 'scenario') {
    await runPredefinedScenario(scenario);
    process.exit(0);
  } else {
    console.log('\n❌ Mode non reconnu');
    console.log('\n📋 Utilisation:');
    console.log('   node simulate_conversation.js interactive     # Mode interactif');
    console.log('   node simulate_conversation.js scenario        # Scénario par défaut');
    console.log('   node simulate_conversation.js scenario quick  # Scénario rapide');
    console.log('   node simulate_conversation.js scenario negotiation # Scénario négociation');
    process.exit(1);
  }
}

// Gestion des signaux pour fermeture propre
process.on('SIGINT', () => {
  console.log('\n👋 Arrêt du simulateur...');
  process.exit(0);
});

if (require.main === module) {
  main();
}

module.exports = {
  simulateIncomingMessage,
  runPredefinedScenario,
  startInteractiveDemo
}; 