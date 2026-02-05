import os
import logging
import re
import hashlib
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


def _text_cache_key(text: str, source_language: str) -> str:
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    return f"{source_language}:{digest}"


def _get_cached_text_translation(
    text: str, target_language: str, source_language: str
) -> Optional[str]:
    if not text:
        return None
    try:
        translation = Translation.objects.get(
            entity_type="text",
            entity_id=_text_cache_key(text, source_language),
            field_name="text",
            language=target_language,
        )
        return translation.translated_text
    except Translation.DoesNotExist:
        return None


def _save_text_translation(
    text: str, target_language: str, source_language: str, translated_text: str
) -> None:
    if not text:
        return
    Translation.objects.update_or_create(
        entity_type="text",
        entity_id=_text_cache_key(text, source_language),
        field_name="text",
        language=target_language,
        defaults={"translated_text": translated_text},
    )


def translate_text(text: str, target_language: str, source_language: str = "en") -> Optional[str]:
    """Translate text using OpenRouter."""
    if target_language == source_language:
        return text
    if target_language not in SUPPORTED_LANGUAGES:
        return None
    if not text:
        return text

    cached = _get_cached_text_translation(text, target_language, source_language)
    if cached:
        return cached

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
        translated = response.choices[0].message.content.strip()
        if translated:
            _save_text_translation(text, target_language, source_language, translated)
        return translated
    except Exception as e:
        logger.error(f"Translation error: {e}")
        return None


_FINANCE_TITLE_PATTERN = re.compile(
    r"^Will\s+(.+?)\s+go\s+up\s+(.+?)\?$",
    re.IGNORECASE,
)
_FINANCE_DESC_PATTERN = re.compile(
    r"^Prediction window for (.+?): (.+?) to (.+?) \(UTC\)\.$"
)

_FINANCE_SUFFIX_TRANSLATIONS = {
    "zh": {
        "in the next 15 minutes": "在接下来15分钟内会上涨吗？",
        "in the next hour": "在接下来1小时内会上涨吗？",
        "today": "今天会上涨吗？",
        "this week": "本周会上涨吗？",
    },
    "es": {
        "in the next 15 minutes": "en los próximos 15 minutos",
        "in the next hour": "en la próxima hora",
        "today": "hoy",
        "this week": "esta semana",
    },
    "pt": {
        "in the next 15 minutes": "nos próximos 15 minutos",
        "in the next hour": "na próxima hora",
        "today": "hoje",
        "this week": "esta semana",
    },
    "ja": {
        "in the next 15 minutes": "次の15分で",
        "in the next hour": "次の1時間で",
        "today": "今日",
        "this week": "今週",
    },
}

_FINANCE_TITLE_TEMPLATES = {
    "zh": "{asset}{suffix}",
    "es": "¿Subirá {asset} {suffix}?",
    "pt": "{asset} vai subir {suffix}?",
    "ja": "{suffix}{asset}は上がりますか？",
}

_FINANCE_DESC_TEMPLATES = {
    "zh": "预测窗口 {symbol}：{start} 至 {end}（UTC）。",
    "es": "Ventana de predicción para {symbol}: {start} a {end} (UTC).",
    "pt": "Janela de previsão para {symbol}: {start} a {end} (UTC).",
    "ja": "{symbol}の予測ウィンドウ: {start} から {end}（UTC）。",
}

_FINANCE_ASSET_TRANSLATIONS = {
    "zh": {
        "Bitcoin": "比特币",
        "Ethereum": "以太坊",
        "Nvidia": "英伟达",
        "Tesla": "特斯拉",
        "Apple": "苹果",
        "Microsoft": "微软",
        "Google": "谷歌",
        "Meta": "Meta",
        "Amazon": "亚马逊",
    },
    "ja": {
        "Bitcoin": "ビットコイン",
        "Ethereum": "イーサリアム",
        "Nvidia": "エヌビディア",
        "Tesla": "テスラ",
        "Apple": "アップル",
        "Microsoft": "マイクロソフト",
        "Google": "グーグル",
        "Meta": "Meta",
        "Amazon": "アマゾン",
    },
}


def get_finance_translation(event, lang: str) -> Optional[dict]:
    if lang == "en":
        return None
    if event.category != "finance":
        return None

    title_match = _FINANCE_TITLE_PATTERN.match(event.title or "")
    if not title_match:
        return None

    asset_name, suffix = title_match.groups()
    suffix_map = _FINANCE_SUFFIX_TRANSLATIONS.get(lang)
    template = _FINANCE_TITLE_TEMPLATES.get(lang)
    if not suffix_map or not template:
        return None

    suffix_key = suffix.strip().lower()
    translated_suffix = suffix_map.get(suffix_key)
    if not translated_suffix:
        return None

    asset_name_translated = _FINANCE_ASSET_TRANSLATIONS.get(lang, {}).get(asset_name, asset_name)
    title = template.format(asset=asset_name_translated, suffix=translated_suffix)

    description = None
    desc_match = _FINANCE_DESC_PATTERN.match(event.description or "")
    if desc_match:
        symbol, start, end = desc_match.groups()
        desc_template = _FINANCE_DESC_TEMPLATES.get(lang)
        if desc_template:
            description = desc_template.format(symbol=symbol, start=start, end=end)

    return {"title": title, "description": description}


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


def _reuse_event_translations_by_title(event):
    from market.models import EventTranslation

    candidates = (
        EventTranslation.objects.select_related("event")
        .filter(event__title=event.title)
        .exclude(event_id=event.id)
    )
    if not candidates:
        return {}

    reused = {}
    for trans in candidates:
        desc_match = bool(
            trans.description
            and trans.event
            and trans.event.description == event.description
        )
        existing = reused.get(trans.language)
        if not existing or (desc_match and not existing["description_match"]):
            reused[trans.language] = {
                "title": trans.title,
                "description": trans.description if desc_match else None,
                "description_match": desc_match,
            }

    return {
        lang: {"title": data["title"], "description": data["description"]}
        for lang, data in reused.items()
    }


def translate_event(event, *, allow_openrouter: bool = True) -> None:
    """Translate event title and description to all supported languages."""
    from market.models import EventTranslation

    existing_langs = set(
        EventTranslation.objects.filter(event_id=event.id).values_list("language", flat=True)
    )
    reusable = _reuse_event_translations_by_title(event) if event.title else {}

    for lang in SUPPORTED_LANGUAGES:
        if lang == "en":
            continue
        # Skip if translation already exists
        if lang in existing_langs:
            continue

        reused = reusable.get(lang)
        if reused:
            description = reused.get("description")
            if description is None and event.description and allow_openrouter:
                description = translate_text(event.description, lang)
            EventTranslation.objects.create(
                event_id=event.id,
                language=lang,
                title=reused["title"],
                description=description,
            )
            continue

        finance_translation = get_finance_translation(event, lang)
        if finance_translation:
            EventTranslation.objects.create(
                event_id=event.id,
                language=lang,
                title=finance_translation["title"],
                description=finance_translation.get("description"),
            )
            continue

        if not allow_openrouter:
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
