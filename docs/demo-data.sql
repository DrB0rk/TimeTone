-- Optional fictional data for a local TimeTone screenshot/demo workspace.
-- Run after the application has created its SQLite schema:
--   sqlite3 web/data/timekeep.db < docs/demo-data.sql
-- This replaces employee and attendance records; never run it on production data.
BEGIN;
DELETE FROM time_entry_changes;
DELETE FROM device_events;
DELETE FROM time_entries;
DELETE FROM employees;
INSERT OR REPLACE INTO settings(key, value) VALUES ('company_name', 'Northstar Studio');
INSERT OR REPLACE INTO employees(id,name,email,role,code_digest,active,color,created_at,updated_at) VALUES
 ('demo-ava','Ava Chen','ava@example.test','Product',lower(hex(randomblob(32))),1,'#c7ff3d',datetime('now'),datetime('now')),
 ('demo-noah','Noah Williams','noah@example.test','Engineering',lower(hex(randomblob(32))),1,'#5b8cff',datetime('now'),datetime('now')),
 ('demo-mia','Mia Patel','mia@example.test','Design',lower(hex(randomblob(32))),1,'#ff7468',datetime('now'),datetime('now')),
 ('demo-liam','Liam Garcia','liam@example.test','Operations',lower(hex(randomblob(32))),1,'#a06be8',datetime('now'),datetime('now')),
 ('demo-emma','Emma Rossi','emma@example.test','Finance',lower(hex(randomblob(32))),1,'#3f8df5',datetime('now'),datetime('now'));
INSERT INTO time_entries(id,employee_id,clock_in,clock_out,source,note,created_at,updated_at) VALUES
 ('demo-e1','demo-noah','2026-09-02T09:00:00+02:00','2026-09-02T17:15:00+02:00','device',NULL,datetime('now'),datetime('now')),
 ('demo-e2','demo-ava','2026-09-02T10:15:00+02:00','2026-09-02T18:45:00+02:00','device',NULL,datetime('now'),datetime('now')),
 ('demo-e3','demo-mia','2026-09-01T08:30:00+02:00','2026-09-01T15:00:00+02:00','device',NULL,datetime('now'),datetime('now')),
 ('demo-e4','demo-liam','2026-08-31T09:45:00+02:00','2026-08-31T18:00:00+02:00','device',NULL,datetime('now'),datetime('now')),
 ('demo-e5','demo-emma','2026-08-30T10:00:00+02:00','2026-08-30T15:30:00+02:00','device',NULL,datetime('now'),datetime('now')),
 ('demo-e6','demo-mia','2026-08-29T09:00:00+02:00','2026-08-29T17:30:00+02:00','device',NULL,datetime('now'),datetime('now')),
 ('demo-open','demo-ava','2026-09-02T11:15:00+02:00',NULL,'device',NULL,datetime('now'),datetime('now'));
COMMIT;
