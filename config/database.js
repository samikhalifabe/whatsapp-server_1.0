const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

// Configuration Supabase - Support des deux formats de clé
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    logger.error('FATAL ERROR: SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_KEY) environment variables must be set.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = {
  supabase,
};
