-- Grid Social Auto-Poster — Supabase Schema
-- Run this in Supabase SQL Editor to create all tables

-- ── CLIENTS ──
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  client_email TEXT,
  fb_page_id TEXT,
  ig_user_id TEXT,
  page_access_token TEXT,
  twitter_api_key TEXT,
  twitter_api_secret TEXT,
  twitter_access_token TEXT,
  twitter_access_secret TEXT,
  linkedin_access_token TEXT,
  linkedin_refresh_token TEXT,
  linkedin_id TEXT,
  gbp_access_token TEXT,
  gbp_refresh_token TEXT,
  gbp_location_id TEXT,
  tiktok_access_token TEXT,
  tiktok_refresh_token TEXT,
  threads_user_id TEXT,
  threads_access_token TEXT,
  bluesky_identifier TEXT,
  bluesky_app_password TEXT,
  pinterest_access_token TEXT,
  pinterest_refresh_token TEXT,
  pinterest_board_id TEXT,
  approval_mode TEXT DEFAULT 'auto',
  passive_approval_hours INTEGER DEFAULT 72,
  brand_name TEXT,
  brand_color TEXT,
  logo_url TEXT,
  custom_domain TEXT,
  token_health JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── POSTS ──
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  caption TEXT NOT NULL,
  image_url TEXT,
  video_url TEXT,
  image_urls JSONB,
  post_type TEXT DEFAULT 'feed',
  platforms JSONB DEFAULT '["facebook"]',
  status TEXT DEFAULT 'queued',
  scheduled_for TIMESTAMPTZ,
  approval_status TEXT DEFAULT 'approved',
  approval_mode TEXT DEFAULT 'auto',
  passive_deadline TIMESTAMPTZ,
  client_comment TEXT,
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  published_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  results JSONB,
  delete_results JSONB,
  template_id TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posts_client_id ON posts(client_id);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled ON posts(scheduled_for) WHERE status IN ('queued', 'scheduled');

-- ── USERS ──
CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  name TEXT,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  status TEXT DEFAULT 'pending',
  plan TEXT DEFAULT 'free',
  stripe_customer_id TEXT,
  assigned_clients JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── HISTORY ──
CREATE TABLE IF NOT EXISTS history (
  id SERIAL PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  post_id TEXT,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_history_client_id ON history(client_id);

-- ── RATE LIMITS ──
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── POST TEMPLATES ──
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  client_id TEXT REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  caption TEXT,
  platforms JSONB DEFAULT '["facebook", "instagram"]',
  post_type TEXT DEFAULT 'feed',
  image_url TEXT,
  tags JSONB DEFAULT '[]',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_templates_client_id ON templates(client_id);

-- Row-level security (optional — enable if using Supabase Auth)
-- ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clients_updated_at BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER templates_updated_at BEFORE UPDATE ON templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
