CREATE TABLE IF NOT EXISTS friend_outcome_notices(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 owner TEXT NOT NULL REFERENCES profiles(owner) ON DELETE CASCADE,
 actor TEXT NOT NULL REFERENCES profiles(owner) ON DELETE CASCADE,
 request_id INTEGER NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('accepted','declined')),
 created INTEGER NOT NULL,
 read_at INTEGER,
 UNIQUE(request_id)
);
CREATE INDEX IF NOT EXISTS friend_outcome_owner ON friend_outcome_notices(owner,id DESC);
CREATE INDEX IF NOT EXISTS friend_outcome_unread ON friend_outcome_notices(owner,id DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS friend_outcome_expiry ON friend_outcome_notices(created);
CREATE TRIGGER IF NOT EXISTS friend_accepted_notice AFTER UPDATE OF accepted ON friend_links WHEN OLD.accepted=0 AND NEW.accepted=1 BEGIN
 INSERT OR IGNORE INTO friend_outcome_notices(owner,actor,request_id,kind,created) VALUES(NEW.requested_by,CASE WHEN NEW.requested_by=NEW.a THEN NEW.b ELSE NEW.a END,NEW.id,'accepted',unixepoch());
END;
