const { checkDemoState } = require('./check_demo_state');
const { simulateIncomingMessage } = require('./simulate_conversation');

async function testDemoReset() {
  console.log('🧪 TEST AUTOMATISÉ DU RESET DÉMO');
  console.log('='.repeat(50));
  
  try {
    // Étape 1: Créer des données de test
    console.log('\n📝 ÉTAPE 1: Création de données de test...');
    
    const testMessages = [
      'Bonjour, je teste le reset',
      'Je suis intéressé par votre véhicule',
      'Quel est le prix final ?',
      '15000 euros ça vous va ?'  // Devrait créer une offre de prix
    ];
    
    for (let i = 0; i < testMessages.length; i++) {
      console.log(`└── Message ${i + 1}: "${testMessages[i]}"`);
      await simulateIncomingMessage(testMessages[i]);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Attendre 1 seconde
    }
    
    // Étape 2: Vérifier l'état AVANT reset
    console.log('\n🔍 ÉTAPE 2: État AVANT reset...');
    await checkDemoState();
    
    // Étape 3: Effectuer le reset via API
    console.log('\n🔄 ÉTAPE 3: Exécution du reset...');
    
    const response = await fetch('http://localhost:3001/api/demo-conversation-reset', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    const resetResult = await response.json();
    
    if (response.ok && resetResult.success) {
      console.log('✅ Reset API réussi:');
      console.log(`├── Messages supprimés: ${resetResult.deleted.messages}`);
      console.log(`├── Offres supprimées: ${resetResult.deleted.priceOffers}`);
      console.log(`└── Reset effectué à: ${resetResult.resetAt}`);
    } else {
      console.log('❌ Erreur reset API:', resetResult.error);
      return;
    }
    
    // Étape 4: Vérifier l'état APRÈS reset
    console.log('\n🔍 ÉTAPE 4: État APRÈS reset...');
    await checkDemoState();
    
    // Étape 5: Validation des résultats
    console.log('\n✅ ÉTAPE 5: Validation...');
    
    // Vérifier via API que l'état est bien "active"
    const stateResponse = await fetch('http://localhost:3001/api/demo-conversation-state');
    const stateData = await stateResponse.json();
    
    if (stateData.exists && stateData.state === 'active') {
      console.log('✅ État conversation: Actif ✓');
    } else {
      console.log('❌ État conversation: Incorrect');
    }
    
    if (!stateData.detectedPrice) {
      console.log('✅ Prix détecté: Effacé ✓');
    } else {
      console.log('❌ Prix détecté: Pas effacé');
    }
    
    console.log('\n🎉 TEST TERMINÉ AVEC SUCCÈS !');
    
  } catch (error) {
    console.error('\n❌ ERREUR DURANT LE TEST:', error);
  }
}

// Exécuter le test
if (require.main === module) {
  testDemoReset().then(() => {
    console.log('\n👋 Fin du test');
    process.exit(0);
  });
}

module.exports = { testDemoReset }; 