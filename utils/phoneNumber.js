// Function to normalise a phone number
function normalizePhoneNumber(phone) {
  if (!phone) return '';
  return phone.replace('@c.us', '').replace(/\D/g, '');
}

// Function to format a phone number for WhatsApp
function formatPhoneNumber(phone) {
  // Supprimer tous les caractères non numériques
  const cleaned = phone.replace(/\D/g, '');

  // Si le numéro commence par un 0, le remplacer par 33 (code pays France)
  if (cleaned.startsWith('0')) {
    return `33${cleaned.substring(1)}@c.us`;
  }

  // Si le numéro ne contient pas déjà @c.us, l'ajouter
  if (!phone.includes('@c.us')) {
    return `${cleaned}@c.us`;
  }

  return phone;
}

module.exports = {
  normalizePhoneNumber,
  formatPhoneNumber,
};
