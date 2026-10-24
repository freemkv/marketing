-- Preserve source confirmations independently for existing directed reports.
-- The ledger prevents reruns from restoring a source explicitly removed later.
CREATE TABLE IF NOT EXISTS firmware_data_migrations (name TEXT PRIMARY KEY);
INSERT INTO firmware_confirmations(person, target, source, confirmed_at)
SELECT person, source, '', MIN(confirmed_at)
FROM firmware_confirmations
WHERE source != '' AND NOT EXISTS (
  SELECT 1 FROM firmware_data_migrations WHERE name = '0003_crossflash_source_confirmations'
)
GROUP BY person, source
ON CONFLICT(person, target, source) DO NOTHING;
INSERT OR IGNORE INTO firmware_data_migrations(name) VALUES ('0003_crossflash_source_confirmations');
