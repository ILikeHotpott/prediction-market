import os
from django.utils.deprecation import MiddlewareMixin

DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "https://monofuture.com",
    "https://www.monofuture.com",
]


def _parse_allowed_origins(value):
    if not value:
        return []
    return [origin.strip() for origin in value.split(",") if origin.strip()]


def _append_vary_header(response, value):
    existing = response.get("Vary")
    if not existing:
        response["Vary"] = value
        return
    parts = [part.strip() for part in existing.split(",") if part.strip()]
    if value not in parts:
        parts.append(value)
        response["Vary"] = ", ".join(parts)


class SimpleCORSMiddleware(MiddlewareMixin):
    """
    Minimal CORS middleware for local dev.
    In production, replace with django-cors-headers or gateway-level CORS.
    """

    def __init__(self, get_response=None):
        super().__init__(get_response)
        allow_origins_env = os.getenv("CORS_ALLOW_ORIGINS")
        allow_origin_env = os.getenv("CORS_ALLOW_ORIGIN")
        if allow_origins_env:
            self.allowed_origins = _parse_allowed_origins(allow_origins_env)
        elif allow_origin_env:
            self.allowed_origins = _parse_allowed_origins(allow_origin_env)
        else:
            self.allowed_origins = DEFAULT_ALLOWED_ORIGINS

        self.allow_all_origins = "*" in self.allowed_origins
        self.allow_credentials = os.getenv("CORS_ALLOW_CREDENTIALS", "true").lower() in (
            "true",
            "1",
            "yes",
        )
        self.allow_methods = os.getenv(
            "CORS_ALLOW_METHODS", "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        )
        self.allow_headers = os.getenv(
            "CORS_ALLOW_HEADERS", "Content-Type, Authorization, X-User-Id"
        )

    def process_response(self, request, response):
        origin = request.headers.get("Origin")
        allow_origin = None

        if self.allow_all_origins:
            allow_origin = origin or "*"
        elif origin and origin in self.allowed_origins:
            allow_origin = origin

        if allow_origin:
            response["Access-Control-Allow-Origin"] = allow_origin
            if origin:
                _append_vary_header(response, "Origin")
            if self.allow_credentials and allow_origin != "*":
                response["Access-Control-Allow-Credentials"] = "true"

        request_headers = request.headers.get("Access-Control-Request-Headers")
        response["Access-Control-Allow-Methods"] = self.allow_methods
        response["Access-Control-Allow-Headers"] = request_headers or self.allow_headers
        if request.method == "OPTIONS":
            response.status_code = 200
        return response
