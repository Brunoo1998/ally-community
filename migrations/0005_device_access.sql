-- Clave de acceso entre dispositivos independiente del código de recuperación.
-- La clave aleatoria de 32 bytes se muestra una sola vez; solo se guarda su SHA-256.
ALTER TABLE profiles ADD COLUMN device_key_hash TEXT;
