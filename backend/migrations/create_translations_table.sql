-- Create translations table for caching dynamic content translations
-- Run this in Supabase SQL editor

CREATE TABLE IF NOT EXISTS public.translations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  field_name text NOT NULL,
  language text NOT NULL,
  translated_text text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(entity_type, entity_id, field_name, language)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_translations_lookup
ON public.translations(entity_type, entity_id, language);

-- Add comment
COMMENT ON TABLE public.translations IS 'Cache for AI-translated dynamic content';
