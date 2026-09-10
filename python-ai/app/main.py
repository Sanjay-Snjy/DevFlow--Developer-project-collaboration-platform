"""DevFlow AI Service — FastAPI.

Architecture: Next.js → Node.js API → (this service) → LLM provider.
The service owns all AI credentials and validates every prompt response into
strict Pydantic schemas before returning structured JSON.
"""
import json
import logging
import secrets

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .routes.ai import router as ai_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

settings = get_settings()

app = FastAPI(
    title="DevFlow AI Service",
    version="1.0.0",
    description="Structured AI capabilities (task breakdown, issue analysis, project summary, sprint planning).",
)

# CORS is permissive here on purpose: the Node backend proxies every request and
# verifies the shared service key, so this service is never exposed to browsers.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def service_key_guard(request: Request, call_next):
    """Optional shared-secret gate used by the Node backend (health is public)."""
    if request.url.path == "/health":
        return await call_next(request)
    if settings.service_key:
        presented = request.headers.get("x-service-key", "")
        if not secrets.compare_digest(presented, settings.service_key):
            return JSONResponse(status_code=401, content={"error": {"code": "UNAUTHORIZED", "message": "Invalid service key"}})
    response = await call_next(request)
    return response


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "devflow-ai",
        "provider": settings.provider,
        "ai_enabled": settings.ai_enabled,
        "time": __import__("datetime").datetime.now().isoformat(),
    }


app.include_router(ai_router)


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    logging.getLogger("devflow").exception("unhandled error on %s", request.url.path)
    return JSONResponse(status_code=500, content={"error": {"code": "AI_ERROR", "message": "Internal AI service error"}})
