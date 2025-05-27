require('dotenv').config();
const { openai, grokApiKey, getModelApiParams } = require('./config/ai');

async function testGrokComplete() {
  console.log('🚀 Test complet de Grok 3 Mini...\n');

  try {
    // Test avec plus de tokens
    const modelName = "grok-3-mini";
    const apiParams = getModelApiParams(modelName, {
      model: modelName,
      messages: [
        {
          role: "system",
          content: "Vous êtes un vendeur automobile professionnel. Répondez brièvement et efficacement."
        },
        {
          role: "user",
          content: "Avez-vous une BMW d'occasion ?"
        }
      ],
      max_tokens: 500, // Plus de tokens
      temperature: 0.7,
    });

    const completion = await openai.chat.completions.create(apiParams);

    console.log('📝 Réponse finale:');
    console.log(completion.choices[0].message.content);
    
    console.log('\n🧠 Raisonnement:');
    console.log(completion.choices[0].message.reasoning_content);

    console.log('\n📊 Tokens utilisés:');
    console.log('- Total:', completion.usage.total_tokens);
    console.log('- Reasoning:', completion.usage.completion_tokens_details?.reasoning_tokens);
    console.log('- Réponse:', completion.usage.completion_tokens);

  } catch (error) {
    console.log('❌ Erreur:', error.message);
  }
}

testGrokComplete(); 