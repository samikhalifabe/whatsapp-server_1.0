# whatsapp-server

## Configuration multiplateforme

Pour que votre application WhatsApp Automation fonctionne correctement sur macOS et Windows, vous devez gérer les différences de configuration et d'environnement entre ces systèmes d'exploitation, particulièrement en ce qui concerne l'automatisation de Chrome avec Puppeteer.

### Prérequis

Assurez-vous d'avoir installé les éléments suivants :

1.  **Google Chrome** : L'application utilise Puppeteer pour contrôler une instance de Chrome. Assurez-vous que Chrome est installé sur votre système.
2.  **Node.js** : Installez Node.js (version 14 ou supérieure recommandée).

### Installation

1.  Clonez le dépôt.
2.  Naviguez vers le répertoire `whatsapp-server`.
3.  Exécutez le script d'installation :
    ```bash
    node install.js
    ```
    Ce script installera les dépendances nécessaires et vérifiera la présence de Chrome.

### Configuration des variables d'environnement

Créez un fichier `.env` à la racine du répertoire `whatsapp-server` avec les informations suivantes :

```dotenv
SUPABASE_URL=votre_url_supabase
SUPABASE_KEY=votre_clé_anon_supabase
GROK_API_KEY=votre_clé_api_grok # Clé API Grok pour les fonctionnalités IA
GROK_MODEL=grok-3-mini # Optionnel, modèle Grok à utiliser (par défaut: grok-3-mini)
GROK_TEMPERATURE=0.7 # Optionnel, créativité des réponses (0.0 à 1.0)
GROK_MAX_TOKENS=300 # Optionnel, longueur maximale des réponses
GROK_REASONING_EFFORT=low # Optionnel, effort de raisonnement pour Grok 3 Mini (low/high)
# CHROME_PATH=/chemin/vers/chrome # Optionnel, si Chrome n'est pas détecté automatiquement
# WHATSAPP_USER_DATA_DIR=/chemin/pour/données/utilisateur # Optionnel, pour spécifier le répertoire de données utilisateur de Chrome (Windows)
```

Remplacez les valeurs par vos propres informations d'identification Supabase et Grok. Le chemin de Chrome et le répertoire de données utilisateur sont optionnels si la détection automatique fonctionne.

### Démarrage du serveur

Utilisez les scripts npm adaptés à votre système d'exploitation :

*   **Pour Windows** :
    ```bash
    npm run start:win
    ```
*   **Pour macOS ou Linux** :
    ```bash
    npm run start:mac
    ```
    ou simplement :
    ```bash
    npm start
    ```

Pour le développement avec nodemon :

```bash
npm run dev
```

### En cas de problème

*   **Chrome non trouvé** : Si le serveur ne parvient pas à trouver l'exécutable Chrome, vérifiez qu'il est installé dans un emplacement standard. Si vous l'avez installé dans un emplacement personnalisé, définissez la variable d'environnement `CHROME_PATH` dans votre fichier `.env` avec le chemin correct.
*   **Problèmes d'autorisation sur Windows** : Si vous rencontrez des problèmes liés aux autorisations de fichiers ou de répertoire sur Windows, essayez d'exécuter votre terminal en tant qu'administrateur avant de démarrer le serveur. Vous pouvez également spécifier un répertoire de données utilisateur de Chrome différent en définissant la variable d'environnement `WHATSAPP_USER_DATA_DIR` dans votre fichier `.env`.
*   **Problèmes de connexion Supabase** : Vérifiez que `SUPABASE_URL` et `SUPABASE_KEY` sont correctement définis dans votre fichier `.env`.
*   **Problèmes de connexion Grok** : Vérifiez que `GROK_API_KEY` est correctement défini dans votre fichier `.env` si vous utilisez les fonctionnalités IA.

En suivant ces étapes, vous devriez pouvoir configurer et exécuter le serveur WhatsApp Automation sur macOS et Windows.
