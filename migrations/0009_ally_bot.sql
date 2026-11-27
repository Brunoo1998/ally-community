CREATE TABLE ally_bot_settings(id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER NOT NULL CHECK(enabled IN(0,1)),owner TEXT NOT NULL UNIQUE REFERENCES sessions(id));
INSERT INTO sessions(id,expires,blocked_until) VALUES(lower(hex(randomblob(32))),253402300799,253402300799);
INSERT INTO ally_bot_settings(id,enabled,owner) SELECT 1,1,id FROM sessions WHERE rowid=last_insert_rowid();
INSERT INTO profiles(owner,username,recovery_hash,created,role) SELECT owner,'Ally',lower(hex(randomblob(32))),unixepoch(),'member' FROM ally_bot_settings WHERE id=1;
CREATE TRIGGER ally_bot_no_device BEFORE INSERT ON profile_devices WHEN NEW.owner=(SELECT owner FROM ally_bot_settings WHERE id=1) BEGIN SELECT RAISE(ABORT,'ally_service_identity'); END;
CREATE TRIGGER ally_bot_no_device_update BEFORE UPDATE OF owner ON profile_devices WHEN NEW.owner=(SELECT owner FROM ally_bot_settings WHERE id=1) BEGIN SELECT RAISE(ABORT,'ally_service_identity'); END;
CREATE TRIGGER ally_bot_no_admin BEFORE UPDATE OF role,username,owner ON profiles WHEN OLD.owner=(SELECT owner FROM ally_bot_settings WHERE id=1) BEGIN SELECT RAISE(ABORT,'ally_service_identity'); END;
CREATE TABLE ally_bot_replies(id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL CHECK(kind IN ('post','comment')),target INTEGER NOT NULL,post_id INTEGER NOT NULL REFERENCES posts(id),response TEXT NOT NULL CHECK(length(response)<=1200),created INTEGER NOT NULL DEFAULT(unixepoch()),comment_id INTEGER,UNIQUE(kind,target));
CREATE INDEX ally_bot_reply_time ON ally_bot_replies(created,post_id);
CREATE TRIGGER ally_bot_publish AFTER INSERT ON ally_bot_replies BEGIN
 SELECT CASE WHEN length(trim(NEW.response))<2 OR NOT EXISTS(
  SELECT 1 FROM ally_bot_settings b JOIN settings s ON s.id=1 JOIN profiles pr ON pr.owner=b.owner JOIN posts p ON p.id=NEW.post_id JOIN categories k ON k.id=p.category
  WHERE b.id=1 AND b.enabled=1 AND pr.username='Ally' AND pr.role='member' AND s.readonly=0 AND s.review=0 AND p.status='public' AND p.closed=0 AND k.hidden=0 AND p.owner<>b.owner
 ) OR (NEW.kind='post' AND NEW.target<>NEW.post_id) OR (NEW.kind='comment' AND NOT EXISTS(
  SELECT 1 FROM comments c WHERE c.id=NEW.target AND c.post=NEW.post_id AND c.depth<3 AND c.status='public' AND c.owner<>(SELECT owner FROM ally_bot_settings WHERE id=1)
 )) OR (SELECT count(*) FROM ally_bot_replies WHERE created>=unixepoch()-86400)>8
 OR (SELECT count(*) FROM ally_bot_replies WHERE post_id=NEW.post_id AND created>=unixepoch()-86400)>2
 OR (SELECT count(*) FROM ally_bot_replies WHERE post_id=NEW.post_id AND created>=unixepoch()-3600)>1
 THEN RAISE(ABORT,'ally_reply_not_allowed') END;
 INSERT INTO comments(post,parent,depth,owner,body,status,created,photos)
 SELECT NEW.post_id,CASE WHEN NEW.kind='comment' THEN NEW.target ELSE NULL END,
 CASE WHEN NEW.kind='comment' THEN (SELECT depth+1 FROM comments WHERE id=NEW.target) ELSE 0 END,
 b.owner,NEW.response,'public',unixepoch(),'[]' FROM ally_bot_settings b WHERE b.id=1;
 UPDATE ally_bot_replies SET comment_id=last_insert_rowid(),response='' WHERE id=NEW.id;
END;