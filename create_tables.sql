-- Create records table for track & field PRs
CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  athlete TEXT NOT NULL,
  event TEXT NOT NULL,
  gender TEXT,
  pr_text TEXT NOT NULL,
  pr_value REAL NOT NULL, -- numeric value for sorting (seconds for time, meters for distance/height)
  pr_type TEXT NOT NULL,  -- 'time' | 'distance' | 'height' | 'other'
  unit TEXT,
  note TEXT,
  pr_date TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- index to speed lookups by event
CREATE INDEX IF NOT EXISTS idx_records_event ON records(event);
