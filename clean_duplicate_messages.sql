-- Requête SQL pour nettoyer les messages en double dans la base de données Supabase

-- Cette requête identifie les messages en double en se basant sur:
-- 1. Le même contenu (body)
-- 2. Le même expéditeur (is_from_me)
-- 3. La même conversation (conversation_id)
-- 4. Des timestamps proches (dans une fenêtre de 10 secondes)

-- Étape 1: Créer une table temporaire pour identifier les doublons
WITH message_groups AS (
  SELECT 
    id,
    body,
    is_from_me,
    conversation_id,
    timestamp,
    -- Regrouper les messages similaires
    ROW_NUMBER() OVER (
      PARTITION BY 
        body, 
        is_from_me, 
        conversation_id,
        -- Arrondir le timestamp à la dizaine de secondes la plus proche pour regrouper les messages proches
        DATE_TRUNC('minute', timestamp) + 
        INTERVAL '10 second' * FLOOR(EXTRACT(SECONDS FROM timestamp) / 10)
      ORDER BY 
        timestamp ASC
    ) AS row_num
  FROM 
    messages
),
-- Étape 2: Sélectionner les messages à supprimer (tous sauf le premier de chaque groupe)
duplicates AS (
  SELECT id
  FROM message_groups
  WHERE row_num > 1
)

-- Étape 3: Supprimer les messages en double
DELETE FROM messages
WHERE id IN (SELECT id FROM duplicates);

-- Pour vérifier combien de messages seraient supprimés sans les supprimer réellement,
-- vous pouvez d'abord exécuter cette requête:
/*
WITH message_groups AS (
  SELECT 
    id,
    body,
    is_from_me,
    conversation_id,
    timestamp,
    ROW_NUMBER() OVER (
      PARTITION BY 
        body, 
        is_from_me, 
        conversation_id,
        DATE_TRUNC('minute', timestamp) + 
        INTERVAL '10 second' * FLOOR(EXTRACT(SECONDS FROM timestamp) / 10)
      ORDER BY 
        timestamp ASC
    ) AS row_num
  FROM 
    messages
),
duplicates AS (
  SELECT id
  FROM message_groups
  WHERE row_num > 1
)

SELECT COUNT(*) AS messages_to_delete FROM duplicates;
*/

-- Pour voir les messages qui seraient supprimés:
/*
WITH message_groups AS (
  SELECT 
    id,
    body,
    is_from_me,
    conversation_id,
    timestamp,
    ROW_NUMBER() OVER (
      PARTITION BY 
        body, 
        is_from_me, 
        conversation_id,
        DATE_TRUNC('minute', timestamp) + 
        INTERVAL '10 second' * FLOOR(EXTRACT(SECONDS FROM timestamp) / 10)
      ORDER BY 
        timestamp ASC
    ) AS row_num
  FROM 
    messages
)

SELECT 
  id, 
  body, 
  is_from_me, 
  conversation_id, 
  timestamp
FROM 
  message_groups
WHERE 
  row_num > 1
ORDER BY 
  body, 
  is_from_me, 
  conversation_id, 
  timestamp;
*/
