-- Add unique constraint to prevent duplicate buckets in market_option_series
-- This prevents the table from bloating with duplicate data

-- First, remove any existing duplicates (keep the most recent one)
DELETE FROM market_option_series a
USING market_option_series b
WHERE a.id < b.id
  AND a.option_id = b.option_id
  AND a.interval = b.interval
  AND a.bucket_start = b.bucket_start;

-- Add the unique constraint
ALTER TABLE market_option_series
ADD CONSTRAINT uniq_series_bucket
UNIQUE (option_id, interval, bucket_start);

-- Add index for common query patterns (time-based queries)
CREATE INDEX IF NOT EXISTS idx_series_option_time
ON market_option_series(option_id, bucket_start DESC);

-- Add index for market-based queries
CREATE INDEX IF NOT EXISTS idx_series_market_time
ON market_option_series(market_id, bucket_start DESC);
