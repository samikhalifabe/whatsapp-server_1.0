const { createClient } = require('@supabase/supabase-js');

// Configuration Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('FATAL ERROR: SUPABASE_URL and SUPABASE_KEY environment variables must be set.');
    process.exit(1); // Exit if Supabase credentials are not set
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function getVehicles() {
  try {
    console.log('Récupération des véhicules...');
    
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Erreur lors de la récupération des véhicules:', error);
      return;
    }
    
    if (!data || data.length === 0) {
      console.log('Aucun véhicule trouvé');
      return;
    }
    
    console.log(`${data.length} véhicules trouvés:`);
    data.forEach(vehicle => {
      console.log(`ID: ${vehicle.id}, Marque: ${vehicle.brand}, Modèle: ${vehicle.model}, Téléphone: ${vehicle.phone || 'Non défini'}`);
    });
  } catch (error) {
    console.error('Exception lors de la récupération des véhicules:', error);
  }
}

// Exécuter la fonction
getVehicles()
  .then(() => console.log('Terminé'))
  .catch(err => console.error('Erreur:', err));
