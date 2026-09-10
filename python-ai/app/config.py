"""Environment configuration for the DevFlow AI service."""
import os
from functools import lru_cache


@lru_cache(maxsize=1)
def get_settings() -> "Settings":
    return Settings()


class Settings:
    provider: str
    api_key: str
    api_base: str
    model: str
    service_key: str
    port: int

    def __init__(self) -> None:
        # try a local .env file if present (no external deps needed for it)
        self._maybe_load_dotenv()
        self.provider = os.environ.get("AI_PROVIDER", "auto").lower()
        self.api_key = os.environ.get("AI_API_KEY", "").strip()
        self.api_base = os.environ.get("AI_API_BASE", "https://api.openai.com/v1").rstrip("/")
        self.model = os.environ.get("AI_MODEL", "gpt-4o-mini")
        self.service_key = os.environ.get("AI_SERVICE_KEY", "").strip()
        port = os.environ.get("PORT", "8000")
        try:
            self.port = int(port)
        except ValueError:
            self.port = 8000

    @staticmethod
    def _maybe_load_dotenv() -> None:
        try:
            path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
            if os.path.exists(path):
                for line in open(path, encoding="utf-8"):
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, value = line.split("=", 1)
                    os.environ.setdefault(key.strip(), value.strip())
        except Exception:  # pragma: no cover - best effort
            pass

    @property
    def ai_enabled(self) -> bool:
        if self.provider == "none":
            return False
        if self.provider in ("auto", "openai"):
            return bool(self.api_key)
        return False
