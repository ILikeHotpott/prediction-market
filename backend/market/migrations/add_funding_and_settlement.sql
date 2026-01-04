-- Migration: Add initial funding and settlement support
-- Date: 2026-01-04
-- Description:
--   1. Add collateral_amount and pool_cash to amm_pools
--   2. Add settlement fields to markets
--   3. Create market_settlements table

-- =============================================================================
-- 1. AMM Pools: Add collateral_amount and pool_cash
-- =============================================================================

-- collateral_amount: Initial funding / subsidy cap (F)
ALTER TABLE amm_pools
ADD COLUMN IF NOT EXISTS collateral_amount numeric NOT NULL DEFAULT 0
  CHECK (collateral_amount >= 0);

-- pool_cash: Net cash from trading (sum of buys - sum of sell payouts)
ALTER TABLE amm_pools
ADD COLUMN IF NOT EXISTS pool_cash numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN amm_pools.collateral_amount IS 'Initial funding amount (subsidy cap F). Used to compute b = F/ln(N) and cover worst-case losses.';
COMMENT ON COLUMN amm_pools.pool_cash IS 'Net cash from trading. Increases on buy, decreases on sell. Primary source for settlement payouts.';

-- =============================================================================
-- 2. Markets: Add settlement fields
-- =============================================================================

-- settled_at: Timestamp when market was settled
ALTER TABLE markets
ADD COLUMN IF NOT EXISTS settled_at timestamp with time zone;

-- settlement_tx_id: Unique identifier for the settlement transaction (for idempotency)
ALTER TABLE markets
ADD COLUMN IF NOT EXISTS settlement_tx_id text;

COMMENT ON COLUMN markets.settled_at IS 'Timestamp when market payouts were completed.';
COMMENT ON COLUMN markets.settlement_tx_id IS 'Unique settlement transaction ID for idempotency.';

-- =============================================================================
-- 3. Market Settlements: Audit table for settlement records
-- =============================================================================

CREATE TABLE IF NOT EXISTS market_settlements (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  market_id uuid NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  resolved_option_id bigint NOT NULL REFERENCES market_options(id),
  total_payout numeric NOT NULL DEFAULT 0 CHECK (total_payout >= 0),
  pool_cash_used numeric NOT NULL DEFAULT 0 CHECK (pool_cash_used >= 0),
  collateral_used numeric NOT NULL DEFAULT 0 CHECK (collateral_used >= 0),
  settled_by uuid REFERENCES users(id),
  settled_at timestamp with time zone NOT NULL DEFAULT now(),
  settlement_tx_id text NOT NULL,

  -- Ensure one settlement per market
  CONSTRAINT market_settlements_market_unique UNIQUE (market_id)
);

-- Index for lookup by settlement_tx_id
CREATE INDEX IF NOT EXISTS idx_market_settlements_tx_id
  ON market_settlements(settlement_tx_id);

COMMENT ON TABLE market_settlements IS 'Audit table recording market settlement details.';
COMMENT ON COLUMN market_settlements.total_payout IS 'Total amount paid out to winning positions.';
COMMENT ON COLUMN market_settlements.pool_cash_used IS 'Amount funded from pool trading cash.';
COMMENT ON COLUMN market_settlements.collateral_used IS 'Amount funded from initial collateral (subsidy).';

-- =============================================================================
-- 4. Indexes for performance
-- =============================================================================

-- Index for finding unsettled resolved markets
CREATE INDEX IF NOT EXISTS idx_markets_resolved_unsettled
  ON markets(status, settled_at)
  WHERE status = 'resolved' AND settled_at IS NULL;

-- Index for pool status
CREATE INDEX IF NOT EXISTS idx_amm_pools_status
  ON amm_pools(status);
