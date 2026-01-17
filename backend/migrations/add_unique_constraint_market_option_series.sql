-- Add unique constraint for UPSERT operations on market_option_series
-- This enables efficient deduplication of price data within 1-minute buckets

-- First, remove any duplicate rows (keep the most recent)
DELETE FROM market_option_series a
USING market_option_series b
WHERE a.id < b.id
  AND a.option_id = b.option_id
  AND a.interval = b.interval
  AND a.bucket_start = b.bucket_start;

-- Add unique constraint
ALTER TABLE market_option_series
ADD CONSTRAINT market_option_series_unique_bucket
UNIQUE (option_id, interval, bucket_start);

-- Create index for efficient time-range queries
CREATE INDEX IF NOT EXISTS idx_market_option_series_time_range
ON market_option_series (option_id, interval, bucket_start DESC);

-- Optional: Add index for cleanup operations
CREATE INDEX IF NOT EXISTS idx_market_option_series_cleanup
ON market_option_series (bucket_start);
