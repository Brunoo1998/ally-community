-- Visitas únicas a los posts. Reutiliza el perfil si existe; para visitantes sin
-- perfil usa un identificador de navegador cuya huella se guarda en la base.
-- Las visitas anteriores a la activación del contador no se pueden reconstruir.
ALTER TABLE posts ADD COLUMN views INTEGER NOT NULL DEFAULT 0;
CREATE TABLE post_views(
  post INTEGER NOT NULL REFERENCES posts(id),
  viewer TEXT NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY(post,viewer)
);
CREATE TRIGGER post_views_add AFTER INSERT ON post_views BEGIN
  UPDATE posts SET views=views+1 WHERE id=NEW.post;
END;
CREATE INDEX posts_views_rank ON posts(views DESC,id DESC) WHERE status='public';
