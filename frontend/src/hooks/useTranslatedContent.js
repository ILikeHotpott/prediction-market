"use client";

import { useMemo } from "react";
import { useLanguage } from "@/components/LanguageProvider";

/**
 * Instant translation hook - no API calls, uses embedded translations.
 * Translations are pre-loaded in the initial API response.
 */
export function useTranslatedContent(entityType, entities, fields = ["title"]) {
  const { locale } = useLanguage();

  return useMemo(() => {
    if (!entities || locale === "en") return entities;

    return entities.map((entity) => {
      if (!entity?.id) return entity;

      // Check if entity has embedded translations
      const translations = entity.translations?.[locale];
      if (!translations) return entity;

      // Apply translations to requested fields
      return {
        ...entity,
        ...Object.fromEntries(
          fields
            .filter((f) => translations[f])
            .map((f) => [f, translations[f]])
        ),
      };
    });
  }, [entities, locale, fields]);
}

export function useTranslatedEntity(entityType, entity, fields = ["title"]) {
  const result = useTranslatedContent(entityType, entity ? [entity] : [], fields);
  return result?.[0] || entity;
}
