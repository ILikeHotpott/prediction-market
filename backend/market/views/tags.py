import json
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt

from market.models import Tag
from market.models.users import User


def _require_admin(request):
    """Check if user is admin, return user or error response."""
    user_id = request.headers.get("X-User-Id")
    if not user_id:
        return None, JsonResponse({"error": "Unauthorized"}, status=401)
    try:
        user = User.objects.get(id=user_id)
        if user.role != "admin":
            return None, JsonResponse({"error": "Admin access required"}, status=403)
        return user, None
    except User.DoesNotExist:
        return None, JsonResponse({"error": "User not found"}, status=404)


def _tag_to_dict(tag):
    return {
        "id": str(tag.id),
        "name": tag.name,
        "sort_order": tag.sort_order,
        "is_nav": tag.is_nav,
        "created_at": tag.created_at.isoformat(),
    }


@csrf_exempt
@require_http_methods(["GET"])
def list_tags(request):
    """List all tags, optionally filter by is_nav."""
    nav_only = request.GET.get("nav") == "1"
    qs = Tag.objects.all()
    if nav_only:
        qs = qs.filter(is_nav=True)
    tags = qs.order_by("sort_order", "name")
    return JsonResponse({"items": [_tag_to_dict(t) for t in tags]})


@csrf_exempt
@require_http_methods(["POST"])
def create_tag(request):
    """Create a new tag (admin only)."""
    user, err = _require_admin(request)
    if err:
        return err

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    name = (data.get("name") or "").strip()
    if not name:
        return JsonResponse({"error": "Name is required"}, status=400)

    # Check for duplicate
    if Tag.objects.filter(name__iexact=name).exists():
        return JsonResponse({"error": "Tag already exists"}, status=400)

    tag = Tag.objects.create(
        name=name,
        sort_order=data.get("sort_order", 0),
        is_nav=data.get("is_nav", False),
    )
    return JsonResponse(_tag_to_dict(tag), status=201)


@csrf_exempt
@require_http_methods(["PUT"])
def update_tag(request, tag_id):
    """Update a tag (admin only)."""
    user, err = _require_admin(request)
    if err:
        return err

    try:
        tag = Tag.objects.get(id=tag_id)
    except Tag.DoesNotExist:
        return JsonResponse({"error": "Tag not found"}, status=404)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    name = (data.get("name") or "").strip()
    if not name:
        return JsonResponse({"error": "Name is required"}, status=400)

    # Check for duplicate (excluding current tag)
    if Tag.objects.filter(name__iexact=name).exclude(id=tag_id).exists():
        return JsonResponse({"error": "Tag already exists"}, status=400)

    tag.name = name
    if "sort_order" in data:
        tag.sort_order = data["sort_order"]
    if "is_nav" in data:
        tag.is_nav = data["is_nav"]
    tag.save()
    return JsonResponse(_tag_to_dict(tag))


@csrf_exempt
@require_http_methods(["DELETE"])
def delete_tag(request, tag_id):
    """Delete a tag (admin only)."""
    user, err = _require_admin(request)
    if err:
        return err

    try:
        tag = Tag.objects.get(id=tag_id)
    except Tag.DoesNotExist:
        return JsonResponse({"error": "Tag not found"}, status=404)

    tag.delete()
    return JsonResponse({"success": True})
