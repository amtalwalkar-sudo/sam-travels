CREATE TABLE IF NOT EXISTS `records` (`id` TEXT NOT NULL, `json` TEXT NOT NULL, `schemaVersion` INTEGER NOT NULL, `updatedAt` TEXT NOT NULL, PRIMARY KEY(`id`));
CREATE INDEX IF NOT EXISTS `index_records_updatedAt` ON `records` (`updatedAt`);
INSERT INTO `records` (`id`, `json`, `schemaVersion`, `updatedAt`) VALUES ('historical-record-v2', '{"id":"historical-record-v2","schemaVersion":1,"createdAt":"2026-11-04T10:00:00Z","updatedAt":"2026-11-04T10:00:00Z","source":"import","revision":1,"data":{"value":"kept"}}', 1, '2026-11-04T10:00:00Z');
INSERT INTO `records` (`id`, `json`, `schemaVersion`, `updatedAt`) VALUES ('driver-event:event-legacy', '{"eventId":"event-legacy","kind":"trip_completed"}', 1, '2026-11-04T10:01:00Z');
CREATE TABLE IF NOT EXISTS `room_master_table` (id INTEGER PRIMARY KEY, identity_hash TEXT);
INSERT OR REPLACE INTO `room_master_table` (id, identity_hash) VALUES(42, 'legacy-v2-hash');