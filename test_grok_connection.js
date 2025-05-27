require('dotenv').config();
const { checkGrokConnection } = require('./services/openai');
const { generateAIResponseWithHistory } = require('./services/aiResponse');
const logger = require('./utils/logger');

async function testGrokConnection() {
  console.log('🚀 Test de connexion Grok...\n');

  try {
    // Test 1: Vérifier la connexion
    console.log('1️⃣ Test de connexion à l\'API Grok:');
    const connectionResult = await checkGrokConnection();
    
    if (connectionResult.success) {
      console.log('✅ Connexion réussie!');
      console.log(`   Modèle: ${connectionResult.model}`);
      console.log(`   Message: ${connectionResult.message}\n`);
    } else {
      console.log('❌ Échec de la connexion:');
      console.log(`   Erreur: ${connectionResult.message}`);
      if (connectionResult.error) {
        console.log(`   Détails: ${connectionResult.error}`);
      }
      return;
    }

    // Test 2: Test de génération de réponse
    console.log('2️⃣ Test de génération de réponse:');
    const testMessage = "Bonjour, pouvez-vous me parler de vos véhicules disponibles ?";
    console.log(`   Question: "${testMessage}"`);
    
    const aiResponse = await generateAIResponseWithHistory('test-user', testMessage);
    
    if (typeof aiResponse === 'object' && aiResponse.text) {
      console.log('✅ Réponse générée avec succès!');
      console.log(`   Réponse: "${aiResponse.text}"`);
      console.log(`   Délai de frappe: ${aiResponse.typingDelay}ms`);
      console.log(`   Indicateur de frappe: ${aiResponse.showTypingIndicator}`);
    } else if (typeof aiResponse === 'string') {
      console.log('✅ Réponse générée avec succès!');
      console.log(`   Réponse: "${aiResponse}"`);
    } else {
      console.log('❌ Erreur lors de la génération de réponse');
      console.log(`   Résultat: ${JSON.stringify(aiResponse)}`);
    }

  } catch (error) {
    console.log('❌ Erreur lors du test:');
    console.log(`   ${error.message}`);
    console.log(`   Stack: ${error.stack}`);
  }
}

// Exécuter le test
testGrokConnection()
  .then(() => {
    console.log('\n🎉 Test terminé!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Erreur fatale:', error);
    process.exit(1);
  }); 