-- Institutions are searched by name as the member types (R19): a trigram
-- index. pg_trgm is a trusted extension, so the migrating role may create it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
