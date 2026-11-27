-- Bandeja privada de informes; nunca se expone a perfiles sin rol admin.
CREATE TABLE IF NOT EXISTS admin_notifications (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 owner TEXT NOT NULL REFERENCES sessions(id),
 delivery_key TEXT NOT NULL CHECK(length(delivery_key) BETWEEN 1 AND 160),
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 180),
 message TEXT NOT NULL CHECK(length(message) BETWEEN 1 AND 16000),
 created INTEGER NOT NULL DEFAULT(unixepoch()),
 read_at INTEGER,
 UNIQUE(owner,delivery_key)
);
CREATE INDEX IF NOT EXISTS admin_notifications_owner_id ON admin_notifications(owner,id DESC);
CREATE INDEX IF NOT EXISTS admin_notifications_unread ON admin_notifications(owner,id DESC) WHERE read_at IS NULL;
