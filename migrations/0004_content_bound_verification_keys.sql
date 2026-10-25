-- FW2 records identify firmware content, not a catalogue identity or revision.
-- Preserve valid FW1 confirmations by copying their content digest to FW2;
-- retain the old rows and guard this copy so removed confirmations stay gone.
CREATE TABLE IF NOT EXISTS firmware_data_migrations (name TEXT PRIMARY KEY);

WITH old_keys(key) AS (
  SELECT target FROM firmware_confirmations
  UNION
  SELECT source FROM firmware_confirmations WHERE source != ''
), identified AS (
  SELECT key,
    CASE
      WHEN substr(key, 1, 15) = 'fw1|mediatek%3A' THEN 'mediatek'
      WHEN substr(key, 1, 14) = 'fw1|pioneer%3A' THEN 'pioneer'
    END AS family
  FROM old_keys
  WHERE length(key) - length(replace(key, '|', '')) = 3
    AND (substr(key, 1, 15) = 'fw1|mediatek%3A' OR substr(key, 1, 14) = 'fw1|pioneer%3A')
), revision_parts AS (
  SELECT key, family,
    substr(substr(key, 5), instr(substr(key, 5), '|') + 1) AS revision_digest
  FROM identified
  WHERE family IS NOT NULL AND instr(substr(key, 5), '|') > 1
), content_parts AS (
  SELECT key, family,
    substr(revision_digest, instr(revision_digest, '|') + 1) AS content_digest
  FROM revision_parts
  WHERE instr(revision_digest, '|') > 1
), key_map(old_key, new_key) AS (
  SELECT key, 'fw2|' || family || '|' || content_digest
  FROM content_parts
  WHERE (family = 'mediatek'
      AND length(content_digest) = 64
      AND content_digest NOT GLOB '*[^0-9a-f]*')
    OR (family = 'pioneer'
      AND length(content_digest) = 129
      AND substr(content_digest, 65, 1) = ':'
      AND substr(content_digest, 1, 64) NOT GLOB '*[^0-9a-f]*'
      AND substr(content_digest, 66, 64) NOT GLOB '*[^0-9a-f]*')
    OR (family = 'pioneer'
      AND length(content_digest) = 65
      AND substr(content_digest, 1, 1) = ':'
      AND substr(content_digest, 2, 64) NOT GLOB '*[^0-9a-f]*')
)
INSERT INTO firmware_confirmations(person, target, source, confirmed_at)
SELECT confirmation.person,
  COALESCE(target_map.new_key, confirmation.target),
  COALESCE(source_map.new_key, confirmation.source),
  confirmation.confirmed_at
FROM firmware_confirmations AS confirmation
LEFT JOIN key_map AS target_map ON target_map.old_key = confirmation.target
LEFT JOIN key_map AS source_map ON source_map.old_key = confirmation.source
WHERE (target_map.old_key IS NOT NULL OR source_map.old_key IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM firmware_data_migrations
    WHERE name = '0004_content_bound_verification_keys'
  )
ON CONFLICT(person, target, source) DO UPDATE SET
  confirmed_at = MIN(firmware_confirmations.confirmed_at, excluded.confirmed_at);

INSERT OR IGNORE INTO firmware_data_migrations(name)
VALUES ('0004_content_bound_verification_keys');
