require('dotenv').config();
const { openai, grokApiKey, getModelApiParams } = require('./config/ai');
const logger = require('./utils/logger');

async function testGrokSimple() {
  console.log('🚀 Test simple de Grok 3 Mini...\n');

  try {
    if (!grokApiKey) {
      console.log('❌ Clé API Grok non configurée');
      return;
    }

    // Test simple sans templates
    console.log('1️⃣ Test de base:');
    const modelName = "grok-3-mini";
    const apiParams = getModelApiParams(modelName, {
      model: modelName,
      messages: [
        {
          role: "system",
          content: "Vous êtes un assistant commercial automobile professionnel et chaleureux."
        },
        {
          role: "user",
          content: "Bonjour, avez-vous des voitures d'occasion disponibles ?"
        }
      ],
      max_tokens: 200,
      temperature: 0.7,
    });

    console.log('   Paramètres API:', JSON.stringify(apiParams, null, 2));

    const completion = await openai.chat.completions.create(apiParams);

    // Afficher les résultats
    console.log('\n✅ Réponse générée:');
    console.log('   Réponse:', completion.choices[0].message.content);
    
    if (completion.choices[0].message.reasoning_content) {
      console.log('\n🧠 Trace de raisonnement:');
      console.log('  ', completion.choices[0].message.reasoning_content);
    }

    if (completion.usage) {
      console.log('\n📊 Utilisation tokens:');
      console.log('   Total:', completion.usage.total_tokens);
      console.log('   Prompt:', completion.usage.prompt_tokens);
      console.log('   Completion:', completion.usage.completion_tokens);
      if (completion.usage.completion_tokens_details?.reasoning_tokens) {
        console.log('   Reasoning:', completion.usage.completion_tokens_details.reasoning_tokens);
      }
    }

    // Test mathématique pour vérifier le reasoning
    console.log('\n2️⃣ Test de raisonnement mathématique:');
    const mathParams = getModelApiParams(modelName, {
      model: modelName,
      messages: [
        {
          role: "system",
          content: "Vous êtes un assistant mathématique. Expliquez votre raisonnement étape par étape."
        },
        {
          role: "user",
          content: "Combien font 127 multiplié par 8 ?"
        }
      ],
      max_tokens: 150,
      temperature: 0.3,
    });

    const mathCompletion = await openai.chat.completions.create(mathParams);
    
    console.log('   Question: "Combien font 127 multiplié par 8 ?"');
    console.log('   Réponse:', mathCompletion.choices[0].message.content);
    
    if (mathCompletion.choices[0].message.reasoning_content) {
      console.log('\n🧠 Raisonnement mathématique:');
      console.log('  ', mathCompletion.choices[0].message.reasoning_content);
    }

  } catch (error) {
    console.log('❌ Erreur:', error.message);
    if (error.response?.data) {
      console.log('   Détails API:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testGrokSimple()
  .then(() => {
    console.log('\n🎉 Test terminé!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Erreur fatale:', error);
    process.exit(1);
  }); 