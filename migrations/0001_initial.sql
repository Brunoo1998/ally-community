CREATE TABLE categories(id INTEGER PRIMARY KEY,name TEXT UNIQUE NOT NULL,position INTEGER NOT NULL,hidden INTEGER DEFAULT 0);
INSERT INTO categories(name,position) VALUES ('General',1),('Juegos de PC',2),('Juegos Port y recompilaciones',3),('Configuraciones y optimización',4),('Rendimiento y FPS',5),('Drivers y controladores',6),('BIOS y firmware',7),('Windows y software',8),('Armoury Crate SE',9),('Emulación',10),('Problemas técnicos',11),('Accesorios y periféricos',12),('Sugerencias para Ally Lab',13),('Sugerencias para Ally AI',14),('Ayuda a la comunidad',15);
CREATE TABLE sessions(id TEXT PRIMARY KEY,expires INTEGER NOT NULL,blocked_until INTEGER DEFAULT 0);
CREATE TABLE settings(id INTEGER PRIMARY KEY CHECK(id=1),readonly INTEGER DEFAULT 0,stop_posts INTEGER DEFAULT 0,review INTEGER DEFAULT 0);
INSERT INTO settings(id) VALUES(1);
CREATE TABLE posts(id INTEGER PRIMARY KEY,owner TEXT NOT NULL REFERENCES sessions(id),category INTEGER NOT NULL REFERENCES categories(id),title TEXT NOT NULL,body TEXT NOT NULL,game TEXT,tags TEXT NOT NULL,config TEXT,debate INTEGER DEFAULT 0,status TEXT NOT NULL DEFAULT 'public',closed INTEGER DEFAULT 0,pinned INTEGER DEFAULT 0,score INTEGER DEFAULT 0,replies INTEGER DEFAULT 0,hash TEXT NOT NULL,created INTEGER NOT NULL);
CREATE UNIQUE INDEX once_debate ON posts(game) WHERE debate=1 AND status NOT IN ('deleted','hidden');
CREATE INDEX post_recent ON posts(status,pinned DESC,id DESC);
CREATE INDEX post_score ON posts(status,pinned DESC,score DESC,id DESC);
CREATE INDEX post_replies ON posts(status,pinned DESC,replies DESC,id DESC);
CREATE INDEX post_game ON posts(game,status,id DESC);
CREATE INDEX post_category ON posts(category,status,id DESC);
CREATE INDEX post_duplicates ON posts(owner,hash,created);
CREATE TABLE comments(id INTEGER PRIMARY KEY,post INTEGER NOT NULL REFERENCES posts(id),parent INTEGER REFERENCES comments(id),depth INTEGER NOT NULL CHECK(depth BETWEEN 0 AND 3),owner TEXT NOT NULL REFERENCES sessions(id),body TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'public',score INTEGER DEFAULT 0,created INTEGER NOT NULL);
CREATE INDEX comment_tree ON comments(post,parent,id);
CREATE INDEX comment_duplicates ON comments(owner,post,created);
CREATE TABLE votes(owner TEXT NOT NULL REFERENCES sessions(id),kind TEXT NOT NULL CHECK(kind IN ('post','comment')),target INTEGER NOT NULL,value INTEGER NOT NULL CHECK(value IN (-1,1)),PRIMARY KEY(owner,kind,target));
CREATE TRIGGER vote_add AFTER INSERT ON votes BEGIN
 UPDATE posts SET score=score+NEW.value WHERE NEW.kind='post' AND id=NEW.target;
 UPDATE comments SET score=score+NEW.value WHERE NEW.kind='comment' AND id=NEW.target;
END;
CREATE TRIGGER vote_change AFTER UPDATE OF value ON votes BEGIN
 UPDATE posts SET score=score+NEW.value-OLD.value WHERE NEW.kind='post' AND id=NEW.target;
 UPDATE comments SET score=score+NEW.value-OLD.value WHERE NEW.kind='comment' AND id=NEW.target;
END;
CREATE TRIGGER vote_remove AFTER DELETE ON votes BEGIN
 UPDATE posts SET score=score-OLD.value WHERE OLD.kind='post' AND id=OLD.target;
 UPDATE comments SET score=score-OLD.value WHERE OLD.kind='comment' AND id=OLD.target;
END;
CREATE TRIGGER comment_add AFTER INSERT ON comments WHEN NEW.status='public' BEGIN
 UPDATE posts SET replies=replies+1 WHERE id=NEW.post;
END;
CREATE TRIGGER comment_status AFTER UPDATE OF status ON comments WHEN OLD.status<>NEW.status BEGIN
 UPDATE posts SET replies=replies+(NEW.status='public')-(OLD.status='public') WHERE id=NEW.post;
END;
CREATE TABLE rate(key TEXT PRIMARY KEY,hits INTEGER NOT NULL,expires INTEGER NOT NULL);
CREATE INDEX rate_expiry ON rate(expires);
CREATE TABLE reports(id INTEGER PRIMARY KEY,owner TEXT NOT NULL,kind TEXT NOT NULL,target INTEGER NOT NULL,reason TEXT NOT NULL,details TEXT NOT NULL,created INTEGER NOT NULL,closed INTEGER DEFAULT 0,UNIQUE(owner,kind,target));
CREATE TABLE notices(id INTEGER PRIMARY KEY,owner TEXT NOT NULL,post INTEGER,message TEXT NOT NULL,created INTEGER NOT NULL);
CREATE INDEX notice_owner ON notices(owner,id DESC);
CREATE TABLE audit(id INTEGER PRIMARY KEY,action TEXT NOT NULL,target TEXT NOT NULL,created INTEGER NOT NULL);
CREATE VIRTUAL TABLE post_search USING fts5(title,body,tags,tokenize='unicode61 remove_diacritics 2');
CREATE TRIGGER search_insert AFTER INSERT ON posts WHEN NEW.status='public' BEGIN
 INSERT INTO post_search(rowid,title,body,tags) VALUES(NEW.id,NEW.title,NEW.body,NEW.tags);
END;
CREATE TRIGGER search_update AFTER UPDATE OF title,body,tags,status ON posts BEGIN
 DELETE FROM post_search WHERE rowid=OLD.id;
 INSERT INTO post_search(rowid,title,body,tags) SELECT NEW.id,NEW.title,NEW.body,NEW.tags WHERE NEW.status='public';
END;

CREATE TRIGGER notify_reply AFTER INSERT ON comments WHEN NEW.status='public' BEGIN
 INSERT INTO notices(owner,post,message,created)
 SELECT recipient,NEW.post,'Han respondido a tu contenido.',NEW.created
 FROM (SELECT owner AS recipient FROM posts WHERE id=NEW.post UNION SELECT owner FROM comments WHERE id=NEW.parent)
 WHERE recipient<>NEW.owner;
END;
CREATE TRIGGER notify_approved AFTER UPDATE OF status ON comments WHEN OLD.status='pending' AND NEW.status='public' BEGIN
 INSERT INTO notices(owner,post,message,created)
 SELECT recipient,NEW.post,'Han respondido a tu contenido.',unixepoch()
 FROM (SELECT owner AS recipient FROM posts WHERE id=NEW.post UNION SELECT owner FROM comments WHERE id=NEW.parent)
 WHERE recipient<>NEW.owner;
END;
