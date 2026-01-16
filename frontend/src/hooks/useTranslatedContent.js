"use client";

import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/components/LanguageProvider";

const backendBase =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
    : "";

async function fetchTranslations(entityType, entityIds, fields, lang) {
  if (lang === "en" || !entityIds.length) return {};

  const params = new URLSearchParams({
    entity_type: entityType,
    entity_ids: entityIds.join(","),
    fields: fields.join(","),
    lang,
  });

  const res = await fetch(`${backendBase}/api/translate/?${params}`);
  if (!res.ok) return {};

  const data = await res.json();
  return data.translations || {};
}

export function useTranslatedContent(entityType, entities, fields = ["title"]) {
  const { locale } = useLanguage();

  const entityIds = entities?.map((e) => e?.id).filter(Boolean) || [];

  const { data: translations = {} } = useQuery({
    queryKey: ["translations", entityType, entityIds.join(","), fields.join(","), locale],
    queryFn: () => fetchTranslations(entityType, entityIds, fields, locale),
    enabled: locale !== "en" && entityIds.length > 0,
    staleTime: 1000 * 60 * 60, // 1 hour
    cacheTime: 1000 * 60 * 60 * 24, // 24 hours
  });

  // Return entities with translated fields
  return entities?.map((entity) => {
    if (!entity?.id || locale === "en") return entity;

    const entityTranslations = translations[String(entity.id)];
    if (!entityTranslations) return entity;

    return {
      ...entity,
      ...Object.fromEntries(
        fields
          .filter((f) => entityTranslations[f])
          .map((f) => [f, entityTranslations[f]])
      ),
    };
  });
}

export function useTranslatedEntity(entityType, entity, fields = ["title"]) {
  const result = useTranslatedContent(entityType, entity ? [entity] : [], fields);
  return result?.[0] || entity;
}
