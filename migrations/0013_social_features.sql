-- Additive migration; existing accounts and content remain untouched.
CREATE TABLE IF NOT EXISTS profile_public_details(owner TEXT PRIMARY KEY REFERENCES profiles(owner), avatar TEXT NOT NULL DEFAULT '🎮', bio TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT 'purple');
CREATE TABLE IF NOT EXISTS accepted_solutions(post INTEGER PRIMARY KEY REFERENCES posts(id), comment INTEGER NOT NULL REFERENCES comments(id));
CREATE TABLE IF NOT EXISTS thread_polls(post INTEGER PRIMARY KEY REFERENCES posts(id), options TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS thread_poll_votes(post INTEGER NOT NULL REFERENCES thread_polls(post) ON DELETE CASCADE, owner TEXT NOT NULL REFERENCES profiles(owner), choice INTEGER NOT NULL CHECK(choice BETWEEN 0 AND 5), PRIMARY KEY(post,owner));
CREATE INDEX IF NOT EXISTS thread_poll_choice ON thread_poll_votes(post,choice);
CREATE TABLE IF NOT EXISTS thread_follows(owner TEXT NOT NULL REFERENCES profiles(owner), post INTEGER NOT NULL REFERENCES posts(id), PRIMARY KEY(owner,post));
CREATE INDEX IF NOT EXISTS thread_follow_post ON thread_follows(post,owner);
CREATE TABLE IF NOT EXISTS notice_read_cursor(owner TEXT PRIMARY KEY REFERENCES profiles(owner), through_id INTEGER NOT NULL DEFAULT 0);
CREATE TRIGGER IF NOT EXISTS notify_thread_followers_insert AFTER INSERT ON comments WHEN NEW.status='public' BEGIN
 INSERT INTO notices(owner,post,message,created)
 SELECT f.owner,NEW.post,'Hay un comentario nuevo en un hilo que sigues.',NEW.created FROM thread_follows f JOIN posts p ON p.id=f.post JOIN categories k ON k.id=p.category
 WHERE f.post=NEW.post AND p.status='public' AND k.hidden=0 AND f.owner<>NEW.owner AND f.owner<>p.owner
 AND NOT EXISTS(SELECT 1 FROM comments c WHERE c.id=NEW.parent AND c.owner=f.owner);
END;
CREATE TRIGGER IF NOT EXISTS notify_thread_followers_approved AFTER UPDATE OF status ON comments WHEN OLD.status='pending' AND NEW.status='public' BEGIN
 INSERT INTO notices(owner,post,message,created)
 SELECT f.owner,NEW.post,'Hay un comentario nuevo en un hilo que sigues.',unixepoch() FROM thread_follows f JOIN posts p ON p.id=f.post JOIN categories k ON k.id=p.category
 WHERE f.post=NEW.post AND p.status='public' AND k.hidden=0 AND f.owner<>NEW.owner AND f.owner<>p.owner
 AND NOT EXISTS(SELECT 1 FROM comments c WHERE c.id=NEW.parent AND c.owner=f.owner);
END;
