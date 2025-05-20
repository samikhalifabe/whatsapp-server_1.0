const { supabase } = require('../config/database');

// This service can be used to export the Supabase client
// and potentially add any low-level database interaction functions
// that don't belong in the models.

module.exports = {
  supabase,
};
