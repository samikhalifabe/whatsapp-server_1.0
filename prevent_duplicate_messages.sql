-- Requête SQL pour éviter les messages en double à l'avenir dans la base de données Supabase

-- Cette requête ajoute un index unique sur les colonnes qui devraient être uniques ensemble
-- pour éviter l'insertion de messages en double.

-- Option 1: Ajouter un index unique sur message_id et conversation_id
-- Cela empêchera l'insertion de messages avec le même ID dans la même conversation
-- Note: Cela ne fonctionnera que si message_id est toujours renseigné et unique pour chaque message

ALTER TABLE messages 
ADD CONSTRAINT unique_message_in_conversation 
UNIQUE (message_id, conversation_id)
WHERE message_id IS NOT NULL;

-- Option 2: Créer une fonction et un trigger pour vérifier les doublons avant insertion
-- Cette option est plus sophistiquée et permet de vérifier si un message similaire existe déjà
-- dans une fenêtre de temps donnée

-- Créer la fonction qui vérifie les doublons
CREATE OR REPLACE FUNCTION prevent_duplicate_messages()
RETURNS TRIGGER AS $$
DECLARE
  existing_message_id UUID;
  time_window INTERVAL = '10 seconds';
BEGIN
  -- Vérifier si un message similaire existe déjà
  SELECT id INTO existing_message_id
  FROM messages
  WHERE 
    conversation_id = NEW.conversation_id AND
    body = NEW.body AND
    is_from_me = NEW.is_from_me AND
    timestamp BETWEEN (NEW.timestamp - time_window) AND (NEW.timestamp + time_window)
  LIMIT 1;
  
  -- Si un message similaire existe, annuler l'insertion
  IF existing_message_id IS NOT NULL THEN
    RAISE NOTICE 'Message similaire déjà existant (ID: %)', existing_message_id;
    RETURN NULL; -- Annuler l'insertion
  END IF;
  
  -- Sinon, permettre l'insertion
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Créer le trigger qui exécute la fonction avant chaque insertion
CREATE TRIGGER prevent_duplicate_messages_trigger
BEFORE INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION prevent_duplicate_messages();

-- Note: Pour désactiver le trigger si nécessaire:
-- ALTER TABLE messages DISABLE TRIGGER prevent_duplicate_messages_trigger;

-- Note: Pour supprimer le trigger si nécessaire:
-- DROP TRIGGER IF EXISTS prevent_duplicate_messages_trigger ON messages;
-- DROP FUNCTION IF EXISTS prevent_duplicate_messages();
