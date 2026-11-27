-- Optimiza los recuentos de reacciones positivas para posts y comentarios.
-- Es aditiva, compatible con los votos existentes y segura de repetir.
CREATE INDEX IF NOT EXISTS votes_like_lookup ON votes(kind,target,value);
