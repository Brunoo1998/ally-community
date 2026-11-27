CREATE TABLE IF NOT EXISTS presence_preferences(owner TEXT PRIMARY KEY REFERENCES profiles(owner) ON DELETE CASCADE, enabled INTEGER NOT NULL CHECK(enabled IN(0,1)));
CREATE TABLE IF NOT EXISTS profile_presence(owner TEXT PRIMARY KEY REFERENCES profiles(owner) ON DELETE CASCADE, expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS profile_presence_expiry ON profile_presence(expires);
