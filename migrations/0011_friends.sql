CREATE TABLE IF NOT EXISTS friend_links(id INTEGER PRIMARY KEY AUTOINCREMENT,a TEXT NOT NULL REFERENCES profiles(owner) ON DELETE CASCADE,b TEXT NOT NULL REFERENCES profiles(owner) ON DELETE CASCADE,requested_by TEXT NOT NULL,accepted INTEGER NOT NULL DEFAULT 0 CHECK(accepted IN (0,1)),created INTEGER NOT NULL, CHECK(a<b),CHECK(requested_by IN(a,b)),UNIQUE(a,b));
CREATE INDEX IF NOT EXISTS friend_links_b ON friend_links(b,accepted);
CREATE TABLE IF NOT EXISTS friend_blocks(owner TEXT NOT NULL REFERENCES profiles(owner) ON DELETE CASCADE,other TEXT NOT NULL REFERENCES profiles(owner) ON DELETE CASCADE,CHECK(owner<>other),PRIMARY KEY(owner,other));
CREATE TABLE IF NOT EXISTS friend_activity_preferences(owner TEXT PRIMARY KEY REFERENCES profiles(owner) ON DELETE CASCADE,enabled INTEGER NOT NULL CHECK(enabled IN(0,1)));
CREATE TABLE IF NOT EXISTS friend_activity(owner TEXT PRIMARY KEY REFERENCES profiles(owner) ON DELETE CASCADE,last_active INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS friend_activity_time ON friend_activity(last_active);
CREATE TABLE IF NOT EXISTS private_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,friendship INTEGER NOT NULL REFERENCES friend_links(id) ON DELETE CASCADE,sender TEXT NOT NULL REFERENCES profiles(owner) ON DELETE CASCADE,body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 2000),created INTEGER NOT NULL,read_at INTEGER);
CREATE INDEX IF NOT EXISTS private_messages_chat ON private_messages(friendship,id DESC);
CREATE INDEX IF NOT EXISTS private_messages_expiry ON private_messages(created);
CREATE INDEX IF NOT EXISTS private_messages_unread ON private_messages(friendship,sender,id) WHERE read_at IS NULL;
CREATE TRIGGER IF NOT EXISTS friend_link_guard BEFORE INSERT ON friend_links BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM friend_blocks WHERE (owner=NEW.a AND other=NEW.b) OR (owner=NEW.b AND other=NEW.a)) OR (SELECT count(*) FROM friend_links WHERE a=NEW.a OR b=NEW.a)>=100 OR (SELECT count(*) FROM friend_links WHERE a=NEW.b OR b=NEW.b)>=100 THEN RAISE(ABORT,'friend_unavailable') END;
END;
CREATE TRIGGER IF NOT EXISTS friend_block_remove AFTER INSERT ON friend_blocks BEGIN
 DELETE FROM friend_links WHERE (a=NEW.owner AND b=NEW.other) OR (a=NEW.other AND b=NEW.owner);
END;
CREATE TRIGGER IF NOT EXISTS friend_message_guard BEFORE INSERT ON private_messages BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM friend_links f JOIN sessions sa ON sa.id=f.a JOIN sessions sb ON sb.id=f.b WHERE f.id=NEW.friendship AND f.accepted=1 AND NEW.sender IN(f.a,f.b) AND sa.blocked_until<=unixepoch() AND sb.blocked_until<=unixepoch() AND NOT EXISTS(SELECT 1 FROM friend_blocks WHERE (owner=f.a AND other=f.b) OR (owner=f.b AND other=f.a))) THEN RAISE(ABORT,'friend_unavailable') END;
 SELECT CASE WHEN (SELECT count(*) FROM private_messages WHERE friendship=NEW.friendship AND created>=unixepoch()-2592000)>=2000 THEN RAISE(ABORT,'chat_full') END;
END;
