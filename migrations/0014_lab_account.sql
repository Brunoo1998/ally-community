-- Scoped cross-site account handoff. Tokens are stored only as SHA-256 hashes.
CREATE TABLE IF NOT EXISTS lab_grants(id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES profiles(owner), device TEXT NOT NULL REFERENCES profile_devices(id) ON DELETE CASCADE, state TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS lab_grants_owner ON lab_grants(owner,expires);
CREATE TABLE IF NOT EXISTS lab_links(id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES profiles(owner), device TEXT NOT NULL REFERENCES profile_devices(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS lab_links_owner ON lab_links(owner,expires);
CREATE TABLE IF NOT EXISTS lab_favorites(owner TEXT NOT NULL REFERENCES profiles(owner), game TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(owner,game));
