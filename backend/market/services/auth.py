from ..models import User


def get_user_from_request(request):
    user_id = request.headers.get("X-User-Id")
    if not user_id:
        return None
    try:
        return User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return None


def require_admin(request):
    user = get_user_from_request(request)
    if not user:
        return {"error": "Unauthorized", "status": 401}
    if user.role != "admin":
        return {"error": "Forbidden", "status": 403}
    return None


