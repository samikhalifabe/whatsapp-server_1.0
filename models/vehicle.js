const { supabase } = require('../services/database');
const { normalizePhoneNumber } = require('../utils/phoneNumber');
const logger = require('../utils/logger');
const { getAiConfig } = require('../services/aiResponse'); // To get unavailability keywords

// Function to find a vehicle by phone number
async function findVehicleByPhone(phone) {
  // Format the phone number for searching
  const formattedPhone = normalizePhoneNumber(phone);

  try {
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .filter('phone', 'ilike', `%${formattedPhone}%`);

    if (error) {
      logger.error('Error searching for vehicle:', error);
      return null;
    }

    if (data && data.length > 0) {
      return data[0];
    }

    return null;
  } catch (error) {
    logger.error('Exception during vehicle search:', error);
    throw error;
  }
}

// Function to update the contact status of a vehicle
async function updateVehicleContactStatus(vehicleId, userId) {
  try {
    if (!vehicleId) {
      logger.warn('updateVehicleContactStatus: Vehicle ID missing.');
      return false;
    }

    const now = new Date().toISOString();

    // Update the vehicle directly
    const { error } = await supabase
      .from('vehicles')
      .update({
        contact_status: 'contacted', // Assuming 'contacted' is the status to set
        updated_at: now
      })
      .eq('id', vehicleId);

    if (error) {
      logger.error(`Error updating status for vehicle ${vehicleId} to "contacted":`, error);
      return false;
    }

    logger.info(`Vehicle ${vehicleId} marked as "contacted".`);
    return true;
  } catch (error) {
    logger.error(`Exception during marking vehicle ${vehicleId} as "contacted":`, error);
    throw error;
  }
}

// Function to mark a vehicle as sold in the DB
async function markVehicleAsSoldInDB(vehicleId) {
  if (!vehicleId) {
    logger.warn('markVehicleAsSoldInDB: Vehicle ID missing.');
    return false;
  }
  try {
    const { error } = await supabase
      .from('vehicles')
      .update({ contact_status: 'vendu', updated_at: new Date().toISOString() }) // Use the 'vendu' status
      .eq('id', vehicleId);

    if (error) {
      logger.error(`Erreur lors de la mise à jour du statut du véhicule ${vehicleId} à "vendu":`, error);
      return false;
    }
    logger.info(`Véhicule ${vehicleId} marqué comme "vendu".`);
    return true;
  } catch (err) {
    logger.error(`Exception lors du marquage du véhicule ${vehicleId} comme "vendu":`, err);
    throw err;
  }
}


// Function to check if a message indicates unavailability
function isVehicleUnavailableResponse(message) {
  const aiConfig = getAiConfig(); // Get the current AI config
  const lowerCaseMsg = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Normalize and remove accents

  const keywords = aiConfig.unavailabilityKeywords;
  if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
    logger.debug("No unavailability keywords configured.");
    return false; // No keywords configured
  }

  return keywords.some(keyword => {
    if (typeof keyword !== 'string' || keyword.trim() === '') return false;
    const normalizedKeyword = keyword.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    // Use a regex to search for the word/phrase as a whole word or at the beginning/end of a sentence
    // to avoid unwanted partial matches (e.g., "revendu")
    // \b corresponds to a word boundary.
    // Escape special characters for the regex.
    const escapedKeyword = normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedKeyword}\\b`, 'i'); // 'i' for case-insensitive (already handled by toLowerCase but good practice)

    // Use the regex for more precision
    return regex.test(lowerCaseMsg);
  });
}


module.exports = {
  findVehicleByPhone,
  updateVehicleContactStatus,
  markVehicleAsSoldInDB,
  isVehicleUnavailableResponse,
};
