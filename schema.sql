-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  api_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Runs table
CREATE TABLE IF NOT EXISTS runs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  total_distance_m INTEGER NOT NULL,
  duration_s INTEGER NOT NULL,
  avg_pace_sec_per_km INTEGER NOT NULL,
  splits_json JSONB NOT NULL,
  raw_points_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Run photos table: store optional screenshots for each run
CREATE TABLE IF NOT EXISTS run_photos (
  id SERIAL PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
