-- Performance indexes for Web3Gambling
-- Run this SQL directly on your Supabase/PostgreSQL database

-- Index for BalanceSnapshot: frequently queried by (user_id, token) in _lock_balance()
CREATE INDEX IF NOT EXISTS idx_balance_snapshot_user_token
ON balance_snapshot(user_id, token);

-- Index for Position: frequently queried by (user_id, market_id, option_id) in _lock_position()
CREATE INDEX IF NOT EXISTS idx_positions_user_market_option
ON positions(user_id, market_id, option_id);

-- Index for trades: frequently queried by user_id for history
CREATE INDEX IF NOT EXISTS idx_trades_user_id
ON trades(user_id);

-- Index for trades: frequently queried by market_id
CREATE INDEX IF NOT EXISTS idx_trades_market_id
ON trades(market_id);

-- Index for order_intents: frequently queried by user_id
CREATE INDEX IF NOT EXISTS idx_order_intents_user_id
ON order_intents(user_id);

-- Index for markets: frequently queried by status
CREATE INDEX IF NOT EXISTS idx_markets_status
ON markets(status);

-- Index for events: frequently queried by status
CREATE INDEX IF NOT EXISTS idx_events_status
ON events(status);

-- Index for market_option_stats: frequently updated by option_id
CREATE INDEX IF NOT EXISTS idx_market_option_stats_market_id
ON market_option_stats(market_id);

-- Index for market_option_series: frequently queried for charts
CREATE INDEX IF NOT EXISTS idx_market_option_series_option_interval_bucket
ON market_option_series(option_id, interval, bucket_start);
