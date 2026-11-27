-- Acelera la selección de los últimos dos comentarios públicos de cada post.
-- No altera ni elimina publicaciones, comentarios ni perfiles.
CREATE INDEX IF NOT EXISTS comments_recent_public ON comments(post,status,created DESC,id DESC);
