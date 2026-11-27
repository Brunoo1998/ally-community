-- Additive migration: retain existing content ownership and moderation.
CREATE TABLE IF NOT EXISTS profiles(owner TEXT PRIMARY KEY REFERENCES sessions(id),username TEXT NOT NULL COLLATE NOCASE UNIQUE,recovery_hash TEXT NOT NULL UNIQUE,created INTEGER NOT NULL,role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member','admin')));
CREATE UNIQUE INDEX IF NOT EXISTS one_admin_profile ON profiles(role) WHERE role='admin';
CREATE TABLE IF NOT EXISTS profile_devices(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES sessions(id),expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS profile_devices_owner ON profile_devices(owner);
CREATE INDEX IF NOT EXISTS profile_posts_owner ON posts(owner,created);
CREATE INDEX IF NOT EXISTS profile_comments_owner ON comments(owner,created);
