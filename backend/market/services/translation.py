import os
import logging
from typing import Optional
from openai import OpenAI

from market.models import Translation

logger = logging.getLogger(__name__)

SUPPORTED_LANGUAGES = ["en", "zh", "es", "pt", "ja"]
LANGUAGE_NAMES = {
    "en": "English",
    "zh": "Simplified Chinese",
    "es": "Spanish",
    "pt": "Portuguese",
    "ja": "Japanese",
}


def get_openrouter_client() -> Optional[OpenAI]:
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        logger.warning("OPENROUTER_API_KEY not set, translations will not work")
        return None
    return OpenAI(api_key=api_key, base_url="https://openrouter.ai/api/v1")


def translate_text(text: str, target_language: str, source_language: str = "en") -> Optional[str]:
    """Translate text using OpenRouter."""
    if target_language == source_language:
        return text
    if target_language not in SUPPORTED_LANGUAGES:
        return None

    client = get_openrouter_client()
    if not client:
        return None

    target_name = LANGUAGE_NAMES.get(target_language, target_language)

    try:
        response = client.chat.completions.create(
            model="google/gemini-2.5-flash",
            messages=[
                {
                    "role": "system",
                    "content": f"You are a translator. Translate the following text to {target_name}. "
                    "Only output the translation, nothing else. Keep the same tone and style.",
                },
                {"role": "user", "content": text},
            ],
            temperature=0.3,
            max_tokens=1000,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"Translation error: {e}")
        return None


def get_cached_translation(
    entity_type: str, entity_id: str, field_name: str, language: str
) -> Optional[str]:
    """Get cached translation from database."""
    try:
        translation = Translation.objects.get(
            entity_type=entity_type,
            entity_id=str(entity_id),
            field_name=field_name,
            language=language,
        )
        return translation.translated_text
    except Translation.DoesNotExist:
        return None


def save_translation(
    entity_type: str, entity_id: str, field_name: str, language: str, translated_text: str
) -> None:
    """Save translation to database."""
    Translation.objects.update_or_create(
        entity_type=entity_type,
        entity_id=str(entity_id),
        field_name=field_name,
        language=language,
        defaults={"translated_text": translated_text},
    )


def translate_entity_field(
    entity_type: str,
    entity_id: str,
    field_name: str,
    original_text: str,
    target_language: str,
) -> str:
    """Translate an entity field with caching."""
    if target_language == "en":
        return original_text

    # Check cache first
    cached = get_cached_translation(entity_type, entity_id, field_name, target_language)
    if cached:
        return cached

    # Translate and cache
    translated = translate_text(original_text, target_language)
    if translated:
        save_translation(entity_type, entity_id, field_name, target_language, translated)
        return translated

    return original_text


def batch_translate(
    items: list[dict], entity_type: str, fields: list[str], target_language: str
) -> list[dict]:
    """Batch translate multiple items."""
    if target_language == "en":
        return items

    result = []
    for item in items:
        entity_id = str(item.get("id", ""))
        translated_item = item.copy()

        for field in fields:
            if field in item and item[field]:
                translated_item[field] = translate_entity_field(
                    entity_type, entity_id, field, item[field], target_language
                )

        result.append(translated_item)

    return result


def translate_event(event) -> None:
    """Translate event title and description to all supported languages."""
    from market.models import EventTranslation

    for lang in SUPPORTED_LANGUAGES:
        if lang == "en":
            continue
        # Skip if translation already exists
        if EventTranslation.objects.filter(event_id=event.id, language=lang).exists():
            continue

        title = translate_text(event.title, lang) if event.title else None
        if not title:
            continue

        description = translate_text(event.description, lang) if event.description else None

        EventTranslation.objects.create(
            event_id=event.id,
            language=lang,
            title=title,
            description=description,
        )
