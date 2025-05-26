// Enhanced logger utility with colors, levels, and better structure

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
};

// Configuration du niveau de log (peut être modifié via variable d'environnement)
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

const currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

// Icônes pour chaque type de log
const icons = {
  error: '❌',
  warn: '⚠️ ',
  info: 'ℹ️ ',
  debug: '🔍',
  success: '✅',
  ai: '🤖',
  whatsapp: '📱',
  database: '💾',
  websocket: '🔌'
};

const formatTimestamp = () => {
  const now = new Date();
  return `${colors.gray}${now.toLocaleTimeString('fr-FR')}${colors.reset}`;
};

const formatLevel = (level) => {
  const levelColors = {
    ERROR: colors.red,
    WARN: colors.yellow,
    INFO: colors.blue,
    DEBUG: colors.gray
  };
  
  const color = levelColors[level.toUpperCase()] || colors.white;
  return `${color}${level.toUpperCase().padEnd(5)}${colors.reset}`;
};

const formatModule = (module) => {
  if (!module) return '';
  return `${colors.cyan}[${module}]${colors.reset} `;
};

const shouldLog = (level) => {
  const levelValue = LOG_LEVELS[level.toUpperCase()];
  return levelValue <= currentLogLevel;
};

const log = (level, message, module = null, ...args) => {
  if (!shouldLog(level)) return;
  
  const timestamp = formatTimestamp();
  const formattedLevel = formatLevel(level);
  const formattedModule = formatModule(module);
  
  console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'](
    `${timestamp} ${formattedLevel} ${formattedModule}${message}`,
    ...args
  );
};

// Fonctions spécialisées pour différents modules
const createModuleLogger = (moduleName) => ({
  info: (message, ...args) => log('INFO', message, moduleName, ...args),
  warn: (message, ...args) => log('WARN', message, moduleName, ...args),
  error: (message, ...args) => log('ERROR', message, moduleName, ...args),
  debug: (message, ...args) => log('DEBUG', message, moduleName, ...args),
  success: (message, ...args) => log('INFO', `${icons.success} ${message}`, moduleName, ...args)
});

module.exports = {
  // Logger général
  info: (message, ...args) => log('INFO', message, null, ...args),
  warn: (message, ...args) => log('WARN', message, null, ...args),
  error: (message, ...args) => log('ERROR', message, null, ...args),
  debug: (message, ...args) => log('DEBUG', message, null, ...args),
  success: (message, ...args) => log('INFO', `${icons.success} ${message}`, null, ...args),
  
  // Loggers spécialisés
  ai: {
    info: (message, ...args) => log('INFO', `${icons.ai} ${message}`, 'AI', ...args),
    warn: (message, ...args) => log('WARN', `${icons.ai} ${message}`, 'AI', ...args),
    error: (message, ...args) => log('ERROR', `${icons.ai} ${message}`, 'AI', ...args),
    debug: (message, ...args) => log('DEBUG', `${icons.ai} ${message}`, 'AI', ...args),
    generating: (message) => log('INFO', `${icons.ai} Génération de réponse: ${message}`, 'AI'),
    response: (message) => log('INFO', `${icons.ai} Réponse générée: ${message}`, 'AI'),
    config: (action) => log('INFO', `${icons.ai} Configuration ${action}`, 'AI')
  },
  
  whatsapp: {
    info: (message, ...args) => log('INFO', `${icons.whatsapp} ${message}`, 'WhatsApp', ...args),
    warn: (message, ...args) => log('WARN', `${icons.whatsapp} ${message}`, 'WhatsApp', ...args),
    error: (message, ...args) => log('ERROR', `${icons.whatsapp} ${message}`, 'WhatsApp', ...args),
    debug: (message, ...args) => log('DEBUG', `${icons.whatsapp} ${message}`, 'WhatsApp', ...args),
    messageReceived: (from, body) => log('INFO', `${icons.whatsapp} Message reçu de ${from}: "${body}"`, 'WhatsApp'),
    messageSent: (to, body) => log('INFO', `${icons.whatsapp} Message envoyé à ${to}: "${body}"`, 'WhatsApp'),
    connected: () => log('INFO', `${icons.whatsapp} ${colors.green}Connecté avec succès${colors.reset}`, 'WhatsApp'),
    disconnected: () => log('WARN', `${icons.whatsapp} ${colors.yellow}Déconnecté${colors.reset}`, 'WhatsApp')
  },
  
  database: {
    info: (message, ...args) => log('INFO', `${icons.database} ${message}`, 'DB', ...args),
    warn: (message, ...args) => log('WARN', `${icons.database} ${message}`, 'DB', ...args),
    error: (message, ...args) => log('ERROR', `${icons.database} ${message}`, 'DB', ...args),
    debug: (message, ...args) => log('DEBUG', `${icons.database} ${message}`, 'DB', ...args),
    query: (table, action) => log('DEBUG', `${icons.database} ${action} sur ${table}`, 'DB'),
    saved: (table, id) => log('INFO', `${icons.database} Enregistré dans ${table} (ID: ${id})`, 'DB')
  },
  
  websocket: {
    info: (message, ...args) => log('INFO', `${icons.websocket} ${message}`, 'WebSocket', ...args),
    warn: (message, ...args) => log('WARN', `${icons.websocket} ${message}`, 'WebSocket', ...args),
    error: (message, ...args) => log('ERROR', `${icons.websocket} ${message}`, 'WebSocket', ...args),
    debug: (message, ...args) => log('DEBUG', `${icons.websocket} ${message}`, 'WebSocket', ...args),
    emit: (event, data) => log('DEBUG', `${icons.websocket} Émission: ${event}`, 'WebSocket'),
    clients: (count) => log('DEBUG', `${icons.websocket} Clients connectés: ${count}`, 'WebSocket')
  },
  
  // Fonction pour créer un logger pour un module spécifique
  module: createModuleLogger,
  
  // Utilitaires
  separator: () => console.log(`${colors.gray}${'─'.repeat(80)}${colors.reset}`),
  section: (title) => {
    console.log(`\n${colors.bright}${colors.blue}▶ ${title}${colors.reset}`);
  }
};
