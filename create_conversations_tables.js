const { createClient } = require('@supabase/supabase-js');

// Configuration Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('FATAL ERROR: SUPABASE_URL and SUPABASE_KEY environment variables must be set.');
    process.exit(1); // Exit if Supabase credentials are not set
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createConversationsTables() {
  try {
    console.log('Création des tables pour les conversations WhatsApp...');
    
    // Vérifier si la fonction uuid_generate_v4 existe
    const { data: uuidFunctionExists, error: uuidError } = await supabase
      .rpc('check_function_exists', { function_name: 'uuid_generate_v4' });
    
    if (uuidError) {
      console.error('Erreur lors de la vérification de la fonction uuid_generate_v4:', uuidError);
      console.log('Création de l\'extension uuid-ossp si nécessaire...');
      
      // Créer l'extension uuid-ossp via une requête SQL
      const createExtensionSQL = `
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      `;
      
      console.log('Veuillez exécuter la requête SQL suivante dans l\'interface Supabase:');
      console.log(createExtensionSQL);
    }
    
    // Créer la table conversations
    console.log('Création de la table conversations...');
    const createConversationsTableSQL = `
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        vehicle_id UUID REFERENCES vehicles(id),
        phone_number VARCHAR NOT NULL,
        chat_id VARCHAR,
        status VARCHAR DEFAULT 'active',
        last_message_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        user_id UUID REFERENCES auth.users(id)
      );

      -- Index pour accélérer les recherches
      CREATE INDEX IF NOT EXISTS idx_conversations_vehicle_id ON conversations(vehicle_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_phone_number ON conversations(phone_number);
    `;
    
    console.log('Veuillez exécuter la requête SQL suivante dans l\'interface Supabase:');
    console.log(createConversationsTableSQL);
    
    // Créer la table messages (mise à jour)
    console.log('Création/mise à jour de la table messages...');
    const createMessagesTableSQL = `
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        conversation_id UUID REFERENCES conversations(id),
        body TEXT NOT NULL,
        is_from_me BOOLEAN NOT NULL DEFAULT FALSE,
        message_id VARCHAR,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        user_id UUID REFERENCES auth.users(id)
      );

      -- Index pour accélérer les recherches
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
    `;
    
    console.log('Veuillez exécuter la requête SQL suivante dans l\'interface Supabase:');
    console.log(createMessagesTableSQL);
    
    // Créer une fonction RPC pour vérifier si une fonction existe
    console.log('Création de la fonction RPC check_function_exists...');
    const createRpcFunctionSQL = `
      CREATE OR REPLACE FUNCTION check_function_exists(function_name text)
      RETURNS boolean
      LANGUAGE plpgsql
      AS $$
      DECLARE
        func_exists boolean;
      BEGIN
        SELECT EXISTS (
          SELECT 1
          FROM pg_proc p
          JOIN pg_namespace n ON p.pronamespace = n.oid
          WHERE p.proname = function_name
        ) INTO func_exists;
        
        RETURN func_exists;
      END;
      $$;
    `;
    
    console.log('Veuillez exécuter la requête SQL suivante dans l\'interface Supabase:');
    console.log(createRpcFunctionSQL);
    
    console.log('Terminé! Veuillez exécuter ces requêtes SQL dans l\'interface Supabase pour créer les tables nécessaires.');
    console.log('Une fois les tables créées, vous pourrez exécuter le script de migration pour transférer les données existantes.');
  } catch (error) {
    console.error('Exception lors de la création des tables:', error);
  }
}

// Exécuter la fonction
createConversationsTables()
  .then(() => console.log('Terminé'))
  .catch(err => console.error('Erreur:', err));
