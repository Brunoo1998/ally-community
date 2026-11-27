-- Fotografías comprimidas; almacenamiento acotado sin servicios adicionales.
ALTER TABLE posts ADD COLUMN photos TEXT NOT NULL DEFAULT '[]';
ALTER TABLE comments ADD COLUMN photos TEXT NOT NULL DEFAULT '[]';
CREATE TABLE IF NOT EXISTS photo_budget(id INTEGER PRIMARY KEY CHECK(id=1),bytes INTEGER NOT NULL CHECK(bytes>=0));
INSERT INTO photo_budget(id,bytes) VALUES(1,0);
CREATE TRIGGER posts_photos_insert AFTER INSERT ON posts BEGIN
  UPDATE photo_budget SET bytes=bytes+max(0,length(NEW.photos)-2)-0 WHERE id=1;
  SELECT CASE WHEN (SELECT bytes FROM photo_budget WHERE id=1)>100000000 THEN RAISE(ABORT,'photo_budget_exceeded') END;
END;
CREATE TRIGGER posts_photos_update AFTER UPDATE OF photos ON posts BEGIN
  UPDATE photo_budget SET bytes=bytes+max(0,length(NEW.photos)-2)-max(0,length(OLD.photos)-2) WHERE id=1;
  SELECT CASE WHEN (SELECT bytes FROM photo_budget WHERE id=1)>100000000 THEN RAISE(ABORT,'photo_budget_exceeded') END;
END;
CREATE TRIGGER posts_photos_delete AFTER DELETE ON posts BEGIN
  UPDATE photo_budget SET bytes=bytes+0-max(0,length(OLD.photos)-2) WHERE id=1;
  SELECT CASE WHEN (SELECT bytes FROM photo_budget WHERE id=1)>100000000 THEN RAISE(ABORT,'photo_budget_exceeded') END;
END;
CREATE TRIGGER comments_photos_insert AFTER INSERT ON comments BEGIN
  UPDATE photo_budget SET bytes=bytes+max(0,length(NEW.photos)-2)-0 WHERE id=1;
  SELECT CASE WHEN (SELECT bytes FROM photo_budget WHERE id=1)>100000000 THEN RAISE(ABORT,'photo_budget_exceeded') END;
END;
CREATE TRIGGER comments_photos_update AFTER UPDATE OF photos ON comments BEGIN
  UPDATE photo_budget SET bytes=bytes+max(0,length(NEW.photos)-2)-max(0,length(OLD.photos)-2) WHERE id=1;
  SELECT CASE WHEN (SELECT bytes FROM photo_budget WHERE id=1)>100000000 THEN RAISE(ABORT,'photo_budget_exceeded') END;
END;
CREATE TRIGGER comments_photos_delete AFTER DELETE ON comments BEGIN
  UPDATE photo_budget SET bytes=bytes+0-max(0,length(OLD.photos)-2) WHERE id=1;
  SELECT CASE WHEN (SELECT bytes FROM photo_budget WHERE id=1)>100000000 THEN RAISE(ABORT,'photo_budget_exceeded') END;
END;
