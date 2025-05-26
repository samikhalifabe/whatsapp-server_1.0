-- Option 1: Désactiver complètement RLS sur la table messages
-- ALTER TABLE messages DISABLE ROW LEVEL SECURITY;

-- Option 2: Créer une policy permissive pour tous les utilisateurs
DROP POLICY IF EXISTS "Allow all operations on messages" ON messages;

CREATE POLICY "Allow all operations on messages" ON messages
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- Vérifier les policies existantes
-- SELECT * FROM pg_policies WHERE tablename = 'messages'; 