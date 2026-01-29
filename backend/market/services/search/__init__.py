import os
import logging
import meilisearch

MEILI_HOST = os.getenv("MEILISEARCH_HOST", "http://localhost:7700")
MEILI_KEY = os.getenv("MEILISEARCH_API_KEY") or None

INDEX_NAME = "events"

_client = None
_settings_checked = False

_INDEX_SETTINGS = {
    "searchableAttributes": ["title", "description", "category"],
    "filterableAttributes": ["status", "category"],
    "sortableAttributes": ["created_at", "trading_deadline", "volume_total"],
}

logger = logging.getLogger(__name__)


def get_client():
    global _client
    if _client is None:
        _client = meilisearch.Client(MEILI_HOST, MEILI_KEY)
    return _client


def get_index():
    global _settings_checked
    client = get_client()
    try:
        index = client.get_index(INDEX_NAME)
    except meilisearch.errors.MeilisearchApiError:
        task = client.create_index(INDEX_NAME, {"primaryKey": "id"})
        client.wait_for_task(task.task_uid)
        index = client.get_index(INDEX_NAME)
        _settings_checked = False

    if not _settings_checked:
        try:
            task = index.update_settings(_INDEX_SETTINGS)
            client.wait_for_task(task.task_uid)
        except Exception as exc:
            logger.warning("Failed to update meilisearch index settings: %s", exc)
        _settings_checked = True
    return index


def index_event(event_data: dict):
    """Index a single event document."""
    index = get_index()
    index.add_documents([event_data])


def index_events(events: list):
    """Index multiple event documents."""
    if not events:
        return
    index = get_index()
    index.add_documents(events)


def search_events(query: str, filters: str = None, sort: list = None, limit: int = 20, offset: int = 0):
    """Search events."""
    index = get_index()
    params = {"limit": limit, "offset": offset}
    if filters:
        params["filter"] = filters
    if sort:
        params["sort"] = sort
    return index.search(query, params)


def delete_event(event_id: str):
    """Delete an event from the index."""
    index = get_index()
    index.delete_document(event_id)
