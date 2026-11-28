-- Private chat media and replies; images follow the same 30-day retention.
ALTER TABLE private_messages ADD COLUMN reply_to INTEGER REFERENCES private_messages(id) ON DELETE SET NULL;
ALTER TABLE private_messages ADD COLUMN photo TEXT;
CREATE TABLE IF NOT EXISTS private_message_reactions(message INTEGER NOT NULL REFERENCES private_messages(id) ON DELETE CASCADE,owner TEXT NOT NULL REFERENCES profiles(owner) ON DELETE CASCADE,emoji TEXT NOT NULL CHECK(emoji IN ('👍','❤️','😂','😮')),PRIMARY KEY(message,owner));
CREATE TABLE IF NOT EXISTS private_photo_budget(id INTEGER PRIMARY KEY CHECK(id=1),bytes INTEGER NOT NULL CHECK(bytes>=0));
INSERT OR IGNORE INTO private_photo_budget(id,bytes) VALUES(1,0);
CREATE TRIGGER IF NOT EXISTS private_photo_insert AFTER INSERT ON private_messages WHEN NEW.photo IS NOT NULL BEGIN
 UPDATE private_photo_budget SET bytes=bytes+length(NEW.photo) WHERE id=1;
 SELECT CASE WHEN (SELECT bytes FROM private_photo_budget WHERE id=1)>30000000 THEN RAISE(ABORT,'photo_budget_exceeded') END;
END;
CREATE TRIGGER IF NOT EXISTS private_photo_delete AFTER DELETE ON private_messages WHEN OLD.photo IS NOT NULL BEGIN
 UPDATE private_photo_budget SET bytes=bytes-length(OLD.photo) WHERE id=1;
END;
CREATE TRIGGER IF NOT EXISTS private_photo_update AFTER UPDATE OF photo ON private_messages BEGIN
 UPDATE private_photo_budget SET bytes=bytes+coalesce(length(NEW.photo),0)-coalesce(length(OLD.photo),0) WHERE id=1;
 SELECT CASE WHEN (SELECT bytes FROM private_photo_budget WHERE id=1)>30000000 THEN RAISE(ABORT,'photo_budget_exceeded') END;
END;
