# Supabase Table Schema for event_subscribers
# Run this SQL in Supabase SQL Editor

SQL_SCHEMA = """
-- Create event_subscribers table
CREATE TABLE IF NOT EXISTS event_subscribers (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL,
    guest_email TEXT NOT NULL,
    subscribed_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(event_id, guest_email)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_event_subscribers_event_id ON event_subscribers(event_id);
CREATE INDEX IF NOT EXISTS idx_event_subscribers_guest_email ON event_subscribers(guest_email);

-- Enable Row Level Security
ALTER TABLE event_subscribers ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Enable insert for authenticated users" ON event_subscribers
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable select for authenticated users" ON event_subscribers
    FOR SELECT USING (true);

CREATE POLICY "Enable update for authenticated users" ON event_subscribers
    FOR UPDATE USING (true);
"""

# Run this SQL in Supabase SQL Editor to create the table