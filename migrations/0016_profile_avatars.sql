CREATE TABLE IF NOT EXISTS member_avatars(owner TEXT PRIMARY KEY REFERENCES profiles(owner) ON DELETE CASCADE, photo TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','public','hidden')), updated INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS member_avatars_status ON member_avatars(status,updated);
CREATE TABLE IF NOT EXISTS avatar_budget(id INTEGER PRIMARY KEY CHECK(id=1),bytes INTEGER NOT NULL CHECK(bytes>=0));
INSERT OR IGNORE INTO avatar_budget(id,bytes) VALUES(1,0);
CREATE TRIGGER IF NOT EXISTS avatar_insert AFTER INSERT ON member_avatars BEGIN
 UPDATE avatar_budget SET bytes=bytes+length(NEW.photo) WHERE id=1;
 SELECT CASE WHEN (SELECT bytes FROM avatar_budget WHERE id=1)>20000000 THEN RAISE(ABORT,'photo_budget_exceeded') END;
END;
CREATE TRIGGER IF NOT EXISTS avatar_update AFTER UPDATE OF photo ON member_avatars BEGIN
 UPDATE avatar_budget SET bytes=bytes+length(NEW.photo)-length(OLD.photo) WHERE id=1;
 SELECT CASE WHEN (SELECT bytes FROM avatar_budget WHERE id=1)>20000000 THEN RAISE(ABORT,'photo_budget_exceeded') END;
END;
CREATE TRIGGER IF NOT EXISTS avatar_delete AFTER DELETE ON member_avatars BEGIN
 UPDATE avatar_budget SET bytes=bytes-length(OLD.photo) WHERE id=1;
END;
