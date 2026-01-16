import os
from django.utils.deprecation import MiddlewareMixin


class SimpleCORSMiddleware(MiddlewareMixin):
    """
    Minimal CORS middleware for local dev.
    In production, replace with django-cors-headers or gateway-level CORS.
    """

    def process_response(self, request, response):
        allow_origin = os.getenv("CORS_ALLOW_ORIGIN", "*")
        response["Access-Control-Allow-Origin"] = allow_origin
        response["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        response["Access-Control-Allow-Headers"] = (
            "Content-Type, Authorization, X-User-Id"
        )
        response["Access-Control-Allow-Credentials"] = "true"
        if request.method == "OPTIONS":
            response.status_code = 200
        return response

