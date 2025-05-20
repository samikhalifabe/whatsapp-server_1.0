# Solution pour les messages WhatsApp en double

Ce document explique comment résoudre le problème des messages WhatsApp en double dans la base de données Supabase.

## Problème identifié

Le problème vient du fait que les messages WhatsApp sont enregistrés en double dans la base de données Supabase. Cela se produit car:

1. La vérification de duplication actuelle ne prend en compte que l'ID du message, mais parfois le même message peut avoir des IDs différents.
2. Lors de la synchronisation entre WhatsApp et Supabase, le même message peut être enregistré plusieurs fois avec des timestamps légèrement différents.

## Solution en deux étapes

### 1. Nettoyer les messages en double existants

Le script `clean_duplicate_messages.js` permet de nettoyer les messages en double existants dans la base de données.

#### Comment l'utiliser:

1. Assurez-vous d'avoir les variables d'environnement correctes pour Supabase:
   ```bash
   echo "SUPABASE_URL=https://xnorovqcdvkuacblcpwp.supabase.co" > .env
   echo "SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhub3JvdnFjZHZrdWFjYmxjcHdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU4MjYxNTUsImV4cCI6MjA2MTQwMjE1NX0.RUTbHbV4h1I6HUFOqp5n0TZWOVyrtbqP-SD_t3yR8AQ" >> .env
   ```

2. Exécutez le script:
   ```bash
   node clean_duplicate_messages.js
   ```

3. Le script va:
   - Récupérer tous les messages de la base de données
   - Identifier les doublons en utilisant une fenêtre de temps de 10 secondes
   - Supprimer les doublons
   - Afficher des statistiques sur le nombre de messages uniques et de doublons

### 2. Éviter les messages en double à l'avenir

Le script `fix_duplicate_messages.js` modifie le fichier `server.js` pour éviter que des messages en double ne soient enregistrés à l'avenir.

#### Comment l'utiliser:

1. Exécutez le script:
   ```bash
   node fix_duplicate_messages.js
   ```

2. Le script va:
   - Créer une sauvegarde du fichier `server.js` original
   - Modifier les fonctions `saveMessage` et `saveConversationToSupabase` pour améliorer la vérification des doublons
   - Ajouter une fenêtre de temps pour regrouper les messages similaires

3. Redémarrez le serveur pour appliquer les modifications:
   ```bash
   node server.js
   ```

## Modifications apportées au serveur

Les modifications suivantes ont été apportées au fichier `server.js`:

1. **Amélioration de la fonction `saveMessage`**:
   - Vérification si un message similaire existe déjà (même contenu, même expéditeur, timestamp proche)
   - Utilisation d'une fenêtre de temps de 10 secondes pour regrouper les messages similaires

2. **Amélioration de la fonction `saveConversationToSupabase`**:
   - Vérification si le message existe déjà par ID
   - Vérification supplémentaire si un message similaire existe déjà (même contenu, même expéditeur, timestamp proche)
   - Évitement des doublons en utilisant une fenêtre de temps

## Comment vérifier que le problème est résolu

1. Exécutez le script `clean_duplicate_messages.js` pour nettoyer les messages en double existants.
2. Exécutez le script `fix_duplicate_messages.js` pour modifier le serveur.
3. Redémarrez le serveur avec `node server.js`.
4. Utilisez l'application normalement et vérifiez que les messages ne sont plus en double dans l'interface.
5. Vous pouvez également vérifier directement dans la base de données Supabase que les messages ne sont plus en double.

## Remarques supplémentaires

- La fenêtre de temps de 10 secondes est un compromis entre éviter les doublons et ne pas manquer des messages légitimes. Vous pouvez ajuster cette valeur selon vos besoins.
- Si vous rencontrez encore des problèmes après avoir appliqué ces modifications, vous pouvez exécuter à nouveau le script `clean_duplicate_messages.js` pour nettoyer les nouveaux doublons.
