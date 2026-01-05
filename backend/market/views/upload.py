import os
import uuid
import boto3
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from ..services.auth import require_admin

# R2 configuration
R2_BUCKET = "monofuture"
R2_PUBLIC_URL = "https://pub-7dfbb630627b4bee8f52115986b10d6a.r2.dev"

def get_r2_client():
    return boto3.client(
        "s3",
        endpoint_url=os.environ.get("CLOUDFLARE_ENDPOINT_URL"),
        aws_access_key_id=os.environ.get("CLOUDFLARE_ACCESS_KEY_ID"),
        aws_secret_access_key=os.environ.get("CLOUDFLARE_SECRET_ACCESS_KEY"),
    )


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def upload_image(request):
    if request.method == "OPTIONS":
        return JsonResponse({}, status=200)

    admin_error = require_admin(request)
    if admin_error:
        return JsonResponse({"error": admin_error["error"]}, status=admin_error["status"])

    if "file" not in request.FILES:
        return JsonResponse({"error": "No file provided"}, status=400)

    file = request.FILES["file"]

    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/gif", "image/webp"]
    if file.content_type not in allowed_types:
        return JsonResponse({"error": "Invalid file type"}, status=400)

    # Generate unique filename
    ext = file.name.split(".")[-1] if "." in file.name else "jpg"
    filename = f"events/{uuid.uuid4()}.{ext}"

    try:
        client = get_r2_client()
        client.upload_fileobj(
            file,
            R2_BUCKET,
            filename,
            ExtraArgs={"ContentType": file.content_type}
        )

        url = f"{R2_PUBLIC_URL}/{filename}"
        return JsonResponse({"url": url}, status=200)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)
