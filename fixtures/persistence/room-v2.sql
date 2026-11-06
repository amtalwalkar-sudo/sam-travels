CREATE TABLE IF NOT EXISTS `records` (`id` TEXT NOT NULL, `json` TEXT NOT NULL, `schemaVersion` INTEGER NOT NULL, `updatedAt` TEXT NOT NULL, PRIMARY KEY(`id`));
CREATE INDEX IF NOT EXISTS `index_records_updatedAt` ON `records` (`updatedAt`);
INSERT INTO `records` (`id`, `json`, `schemaVersion`, `updatedAt`) VALUES ('historical-record-v2', '{"id":"historical-record-v2","schemaVersion":1}', 1, '2026-11-04T10:00:00Z');
CREATE TABLE IF NOT EXISTS `room_master_table` (id INTEGER PRIMARY KEY, identity_hash TEXT);
INSERT OR REPLACE INTO `room_master_table` (id, identity_hash) VALUES(42, 'legacy-v2-hash');