const { exec } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

// Function to detect the Chrome executable path based on the platform
function findChromePath() {
  const platform = os.platform();
  console.log(`Détection du chemin de Chrome pour la plateforme: ${platform}`);

  // Check for CHROME_PATH environment variable first
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    console.log(`Chrome trouvé via la variable d'environnement CHROME_PATH: ${process.env.CHROME_PATH}`);
    return process.env.CHROME_PATH;
  }

  // Potential paths for Windows
  const windowsPaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
    process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
    process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
  ].filter(Boolean); // Filter out null values

  // Potential paths for macOS
  const macOSPaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    path.join(os.homedir(), 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
  ];

  // Potential paths for Linux
  const linuxPaths = [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium', // Common path for snap installations
  ];

  // Check paths based on platform
  let paths = [];
  if (platform === 'win32') {
    paths = windowsPaths;
  } else if (platform === 'darwin') {
    paths = macOSPaths;
  } else if (platform === 'linux') {
    paths = linuxPaths;
  }

  // Check if one of the paths exists
  for (const chromePath of paths) {
    try {
      if (fs.existsSync(chromePath)) {
        console.log(`Chrome trouvé à: ${chromePath}`);
        return chromePath;
      }
    } catch (err) {
      // Ignore errors and continue
      console.warn(`Erreur lors de la vérification du chemin ${chromePath}: ${err.message}`);
    }
  }

  // If no path found, try to detect automatically
  try {
    // On macOS
    if (platform === 'darwin') {
      console.log('Tentative de détection automatique macOS...');
      const output = execSync('mdfind "kMDItemDisplayName == \'Google Chrome\' && kMDItemKind == Application"').toString().trim();
      const installations = output.split('\n').filter(Boolean);
      if (installations.length > 0) {
        const detectedPath = path.join(installations[0], '/Contents/MacOS/Google Chrome');
         if (fs.existsSync(detectedPath)) {
            console.log(`Chrome trouvé via mdfind: ${detectedPath}`);
            return detectedPath;
         }
      }
    }

    // On Windows, use the registry
    if (platform === 'win32') {
      console.log('Tentative de détection du registre Windows...');
      try {
        const registryOutput = execSync(
          'reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe" /ve',
          { encoding: 'utf-8', windowsHide: true } // windowsHide: true prevents console window pop-up
        ).toString();
        const match = registryOutput.match(/REG_SZ\s+(.*)$/i);
        if (match && match[1]) {
          const chromePath = match[1].trim();
           if (fs.existsSync(chromePath)) {
              console.log(`Chrome trouvé via le registre: ${chromePath}`);
              return chromePath;
           }
        }
      } catch (regErr) {
         console.warn(`La requête du registre Windows a échoué: ${regErr.message}`);
      }

       // Fallback for Windows: check common user-specific paths
       if (process.env.USERPROFILE) {
           const userProfilePaths = [
               path.join(process.env.USERPROFILE, 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
               path.join(process.env.USERPROFILE, 'AppData', 'Roaming', 'Google', 'Chrome', 'Application', 'chrome.exe'),
           ];
           for (const chromePath of userProfilePaths) {
               if (fs.existsSync(chromePath)) {
                   console.log(`Chrome trouvé dans le chemin du profil utilisateur: ${chromePath}`);
                   return chromePath;
               }
           }
       }
    }

     // On Linux, try 'which' command
     if (platform === 'linux') {
        console.log('Tentative de détection Linux "which"...');
        try {
            const chromePath = execSync('which google-chrome || which chromium-browser || which chromium', { encoding: 'utf-8' }).toString().trim();
            if (chromePath && fs.existsSync(chromePath)) {
                console.log(`Chrome trouvé via which: ${chromePath}`);
                return chromePath;
            }
        } catch (whichErr) {
            console.warn(`La commande Linux "which" a échoué: ${whichErr.message}`);
        }
     }

  } catch (err) {
    // Ignore automatic detection errors
    console.warn(`La détection automatique de Chrome a échoué: ${err.message}`);
  }

  console.error('Exécutable Chrome non trouvé. Veuillez installer Google Chrome ou définir la variable d\'environnement CHROME_PATH.');
  return null;
}


const platform = os.platform();
console.log(`Détection de la plateforme: ${platform}`);

// Créer les répertoires nécessaires
const dataDir = path.join(os.homedir(), '.whatsapp-automation');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`Répertoire de données créé: ${dataDir}`);
}

// Installer les dépendances
console.log('Installation des dépendances...');
exec('npm install', (error, stdout, stderr) => {
  if (error) {
    console.error(`Erreur lors de l'installation: ${error.message}`);
    return;
  }
  console.log('Dépendances installées avec succès.');

  // Vérifier si Chrome est installé
  const chromePath = findChromePath();
  if (!chromePath) {
    console.log('Chrome n\'a pas été détecté automatiquement.');
    console.log('Veuillez installer Google Chrome et réessayer.');
    return;
  }

  console.log('Installation terminée ! Vous pouvez démarrer l\'application avec:');
  console.log('npm start');
});
