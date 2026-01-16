-- Create event_translations table with foreign key to events
-- Run this in Supabase SQL editor

-- First, clean up old translations table duplicates
DELETE FROM public.translations WHERE id NOT IN (
  SELECT MIN(id) FROM public.translations
  GROUP BY entity_type, entity_id, field_name, language
);

-- Add unique constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'translations_unique_key'
  ) THEN
    ALTER TABLE public.translations
    ADD CONSTRAINT translations_unique_key
    UNIQUE (entity_type, entity_id, field_name, language);
  END IF;
END $$;

-- Create event_translations table
CREATE TABLE IF NOT EXISTS public.event_translations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  language text NOT NULL CHECK (language IN ('en', 'zh', 'es', 'pt', 'ja')),
  title text NOT NULL,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(event_id, language)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_event_translations_event_lang
ON public.event_translations(event_id, language);

-- Add comment
COMMENT ON TABLE public.event_translations IS 'Pre-translated event titles and descriptions';
