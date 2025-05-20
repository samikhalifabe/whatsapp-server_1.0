const { createClient } = require('@supabase/supabase-js');

// Configuration Supabase
const supabaseUrl = 'https://xnorovqcdvkuacblcpwp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhub3JvdnFjZHZrdWFjYmxjcHdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU4MjYxNTUsImV4cCI6MjA2MTQwMjE1NX0.RUTbHbV4h1I6HUFOqp5n0TZWOVyrtbqP-SD_t3yR8AQ';
const supabase = createClient(supabaseUrl, supabaseKey);

async function createMessagesTable() {
  try {
    // Créer la table messages directement
    console.log('Création de la table messages...');
    
    // Utiliser l'API Supabase pour créer la table
    const { data, error } = await supabase
      .from('messages')
      .insert([
        { 
          from: 'test@c.us', 
          body: 'Test message', 
          timestamp: new Date().toISOString(),
          is_from_me: false
        }
      ])
      .select();
    
    if (error) {
      if (error.code === '42P01') {
        console.log('La table messages n\'existe pas encore, création en cours...');
        
        // Créer la table via SQL
        const createTableSQL = `
          CREATE TABLE IF NOT EXISTS messages (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            "from" TEXT NOT NULL,
            body TEXT NOT NULL,
            timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            is_from_me BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `;
        
        // Exécuter le SQL via une fonction RPC ou une requête HTTP
        console.log('Veuillez créer la table manuellement dans l\'interface Supabase avec le SQL suivant:');
        console.log(createTableSQL);
        
        console.log('Ensuite, redémarrez le serveur pour que les changements prennent effet.');
      } else {
        console.error('Erreur lors de l\'insertion du message test:', error);
      }
    } else {
      console.log('Table messages existe et est accessible. Message test inséré avec succès:', data);
    }
  } catch (error) {
    console.error('Exception lors de la création de la table messages:', error);
  }
}

// Exécuter la fonction
createMessagesTable()
  .then(() => console.log('Terminé'))
  .catch(err => console.error('Erreur:', err));
