-- Create finance market windows table for realtime price prediction markets
CREATE TABLE IF NOT EXISTS public.finance_market_windows (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id uuid NOT NULL,
  market_id uuid NOT NULL UNIQUE,
  asset_symbol text NOT NULL,
  asset_name text NOT NULL,
  asset_type text NOT NULL CHECK (asset_type = ANY (ARRAY['crypto'::text, 'stock'::text])),
  interval text NOT NULL CHECK (interval = ANY (ARRAY['15m'::text, '1h'::text, '1d'::text, '1w'::text])),
  window_start timestamp with time zone NOT NULL,
  window_end timestamp with time zone NOT NULL,
  prev_close_price numeric,
  close_price numeric,
  price_precision integer NOT NULL DEFAULT 2,
  source text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT finance_market_windows_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id),
  CONSTRAINT finance_market_windows_market_id_fkey FOREIGN KEY (market_id) REFERENCES public.markets(id),
  CONSTRAINT finance_market_windows_unique_window UNIQUE (asset_symbol, interval, window_start)
);

CREATE INDEX IF NOT EXISTS finance_market_windows_asset_interval_idx
  ON public.finance_market_windows (asset_symbol, interval, window_end);

CREATE INDEX IF NOT EXISTS finance_market_windows_event_idx
  ON public.finance_market_windows (event_id);
