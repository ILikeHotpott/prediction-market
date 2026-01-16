import json
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from market.models import Event, Market, MarketOption
from market.services.translation import translate_entity_field, SUPPORTED_LANGUAGES


@require_http_methods(["GET"])
def translate(request):
    """
    Translate entity fields.

    Query params:
    - entity_type: 'event', 'market', or 'market_option'
    - entity_ids: comma-separated list of IDs
    - fields: comma-separated list of fields (e.g., 'title,description')
    - lang: target language code (en, zh, es, pt, ja)
    """
    entity_type = request.GET.get("entity_type", "event")
    entity_ids = request.GET.get("entity_ids", "").split(",")
    fields = request.GET.get("fields", "title").split(",")
    lang = request.GET.get("lang", "en")

    if lang not in SUPPORTED_LANGUAGES:
        return JsonResponse({"error": f"Unsupported language: {lang}"}, status=400)

    if not entity_ids or entity_ids == [""]:
        return JsonResponse({"error": "entity_ids required"}, status=400)

    # Get original content based on entity type
    translations = {}

    if entity_type == "event":
        events = Event.objects.filter(id__in=entity_ids)
        for event in events:
            translations[str(event.id)] = {}
            for field in fields:
                original = getattr(event, field, None)
                if original:
                    translations[str(event.id)][field] = translate_entity_field(
                        entity_type, str(event.id), field, original, lang
                    )

    elif entity_type == "market":
        markets = Market.objects.filter(id__in=entity_ids)
        for market in markets:
            translations[str(market.id)] = {}
            for field in fields:
                original = getattr(market, field, None)
                if original:
                    translations[str(market.id)][field] = translate_entity_field(
                        entity_type, str(market.id), field, original, lang
                    )

    elif entity_type == "market_option":
        options = MarketOption.objects.filter(id__in=entity_ids)
        for option in options:
            translations[str(option.id)] = {}
            for field in fields:
                original = getattr(option, field, None)
                if original:
                    translations[str(option.id)][field] = translate_entity_field(
                        entity_type, str(option.id), field, original, lang
                    )

    return JsonResponse({"translations": translations, "lang": lang})
