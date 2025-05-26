# 🎭 Système de Test IA - Mode Démo

Ce système permet de tester les conversations avec l'IA sans avoir besoin d'un vrai numéro WhatsApp. Parfait pour les démonstrations, tests et développement.

## 🚀 Démarrage Rapide

### 1. Démarrer le serveur
```bash
# S'assurer que le serveur principal fonctionne
node index.js
```

### 2. Choisir votre mode de test

## 📱 Interface Web (Recommandé)

L'interface web offre une expérience visuelle similaire à WhatsApp pour tester l'IA.

**Accès :** http://localhost:3001/demo

**Fonctionnalités :**
- ✅ Interface chat moderne et intuitive
- ✅ Connexion WebSocket en temps réel
- ✅ Indicateur de frappe de l'IA
- ✅ Boutons de scénarios prédéfinis
- ✅ Historique de conversation
- ✅ Effacement de chat

**Utilisation :**
1. Ouvrez http://localhost:3001/demo dans votre navigateur
2. Attendez que le statut passe à "Connecté" (point vert)
3. Tapez votre message ou utilisez les boutons de scénario
4. L'IA répondra automatiquement selon sa configuration

## 💻 Mode Terminal Interactif

Pour ceux qui préfèrent le terminal :

```bash
# Mode conversation interactive
node simulate_conversation.js interactive
```

**Commandes disponibles :**
- `quit` - Quitter le simulateur
- `help` - Afficher l'aide
- `clear` - Effacer l'écran

## 🎬 Scénarios Prédéfinis

### Via Terminal
```bash
# Scénario par défaut (conversation de base)
node simulate_conversation.js scenario

# Scénario de négociation
node simulate_conversation.js scenario negotiation

# Scénario rapide
node simulate_conversation.js scenario quick
```

### Via Interface Web
Utilisez les boutons :
- 👋 **Saluer** - "Bonjour"
- 🚗 **Intérêt** - "Je suis intéressé par votre véhicule"  
- 💰 **Prix** - "Quel est le prix ?"
- 🤝 **Négocier** - "15000 euros ça vous va ?"

## 🔧 Configuration

### Numéro de Test
- **Numéro fictif :** `demo+33123456789@c.us`
- **Bot IA :** `demo_bot@c.us`
- **ID Utilisateur :** `demo-user-123`

### Personnalisation
Modifiez le fichier `simulate_conversation.js` pour :
- Changer le numéro de test
- Ajouter de nouveaux scénarios
- Modifier les délais entre messages

```javascript
const DEMO_CONFIG = {
  phoneNumber: 'votre-numero-test@c.us',
  chatName: 'Votre Nom de Chat',
  userId: 'votre-user-id'
};
```

## 🔍 Monitoring en Temps Réel

### Logs du Serveur
Surveillez les logs du serveur pour voir :
- Messages entrants simulés
- Réponses IA générées
- Émissions WebSocket
- Sauvegarde en base de données

### WebSocket Monitor
Utilisez le script de monitoring :
```bash
node test_continuous.js
```

## 🎯 Cas d'Usage

### 1. Test de Configuration IA
- Vérifier que l'IA répond correctement
- Tester différents types de messages
- Valider les délais de frappe

### 2. Démonstrations Client
- Montrer le fonctionnement de l'IA
- Présenter les capacités de négociation
- Démontrer la détection de prix

### 3. Développement
- Tester de nouvelles fonctionnalités
- Déboguer les réponses IA
- Valider les intégrations

### 4. Formation
- Apprendre le comportement de l'IA
- Comprendre les scénarios de négociation
- Tester les limites du système

## 🐛 Résolution de Problèmes

### L'IA ne répond pas
1. Vérifiez que l'IA est activée dans la configuration
2. Consultez les logs pour voir si le message est traité
3. Vérifiez l'état de la conversation (doit être 'active')

### Interface web ne se connecte pas
1. Vérifiez que le serveur fonctionne sur le port 3001
2. Ouvrez la console du navigateur pour les erreurs
3. Vérifiez les logs WebSocket côté serveur

### Messages non sauvegardés
1. Vérifiez la connexion Supabase
2. Consultez les logs de base de données
3. Vérifiez les permissions RLS

## 📊 Suivi des Performances

### Métriques Importantes
- Temps de réponse de l'IA
- Taux de détection de prix
- Changements d'état de conversation
- Émissions WebSocket réussies

### Logs à Surveiller
```
[DEMO] 📱 Simulation message de...
[WEBSOCKET] Émission message entrant...
[AI] 🤖 Réponse générée...
[DB] 💾 Message sauvegardé...
```

## 🔄 Intégration Continue

Le système de test peut être intégré dans :
- Tests automatisés
- Pipelines CI/CD  
- Démonstrations automatiques
- Tests de régression

## 📝 Notes Importantes

- **Base de Données :** Les messages de test sont sauvegardés en base comme de vrais messages
- **WebSocket :** Tous les messages transitent par WebSocket comme en production
- **Configuration :** L'IA utilise sa vraie configuration (pas de mode test séparé)
- **Nettoyage :** Pensez à nettoyer les données de test périodiquement

## 🚧 Limitations

- Pas de vraie connexion WhatsApp
- Pas de médias (images, documents)
- Pas de groupes (seulement conversations individuelles)
- Délais de frappe simulés (pas de vraie frappe)

---

**Bon test ! 🎉** 