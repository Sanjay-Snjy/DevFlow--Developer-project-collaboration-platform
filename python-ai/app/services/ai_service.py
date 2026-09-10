"""Provider abstraction for the DevFlow AI service.

The rest of the code talks to a single interface (`generate(model, prompt)`);
the concrete provider is chosen from environment configuration. Currently an
OpenAI-compatible chat-completions provider is implemented, which also works
with local/self-hosted LLM servers exposing the same API shape (vLLM, Ollama,
LM Studio, llama.cpp, ...). Point AI_API_BASE + AI_API_KEY at whichever you use.

If no provider is configured the service answers `503 AI_NOT_CONFIGURED` —
the rest of DevFlow keeps working without AI.
"""
import json
import logging
import re
from typing import Any, Optional, Type, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from ..config import get_settings

logger = logging.getLogger("devflow.ai")
T = TypeVar("T", bound=BaseModel)


class AINotConfigured(Exception):
    """Raised when no AI provider is configured."""


class AIProviderError(Exception):
    """Raised when the upstream provider fails or returns unusable data."""

    def __init__(self, message: str, status: int = 502, code: str = "AI_PROVIDER_ERROR") -> None:
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code


class BaseProvider:
    def is_configured(self) -> bool:
        raise NotImplementedError

    async def chat_json(self, system: str, user_payload: dict, temperature: float = 0.2) -> str:
        raise NotImplementedError


_shared_client: Optional[httpx.AsyncClient] = None


def _get_http_client() -> httpx.AsyncClient:
    global _shared_client
    if _shared_client is None or _shared_client.is_closed:
        _shared_client = httpx.AsyncClient(timeout=120.0)
    return _shared_client


class OpenAICompatProvider(BaseProvider):
    """Speaks the OpenAI /chat/completions protocol to any compatible base URL."""

    def __init__(self) -> None:
        s = get_settings()
        self.api_key = s.api_key
        self.api_base = s.api_base
        self.model = s.model

    @property
    def client(self) -> httpx.AsyncClient:
        return _get_http_client()

    def is_configured(self) -> bool:
        return bool(self.api_key)

    async def chat_json(self, system: str, user_payload: dict, temperature: float = 0.2) -> str:
        try:
            resp = await self.client.post(
                f"{self.api_base}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                json={
                    "model": self.model,
                    "temperature": temperature,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": json.dumps(user_payload, default=str)},
                    ],
                },
            )
        except httpx.HTTPError as exc:
            logger.warning("provider request failed: %s", exc)
            raise AIProviderError("The AI provider is unreachable", status=503, code="AI_PROVIDER_UNREACHABLE") from exc

        if resp.status_code >= 400:
            logger.warning("provider returned %s: %s", resp.status_code, resp.text[:300])
            if resp.status_code in (401, 403):
                raise AIProviderError("AI provider authentication failed", status=502, code="AI_PROVIDER_AUTH")
            raise AIProviderError(f"AI provider error (HTTP {resp.status_code})", status=502, code="AI_PROVIDER_ERROR")

        data = resp.json()
        try:
            content: str = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise AIProviderError("AI provider returned an unexpected payload", status=502, code="AI_INVALID_RESPONSE") from exc
        return content


def _get_provider() -> BaseProvider:
    s = get_settings()
    if s.provider == "none" or (s.provider == "auto" and not s.api_key):
        raise AINotConfigured()
    if s.provider in ("auto", "openai"):
        provider: BaseProvider = OpenAICompatProvider()
        if provider.is_configured():
            return provider
    raise AINotConfigured()


def _extract_json(text: str) -> Any:
    """Tolerantly extracts a JSON object from an LLM answer (fenced / verbose)."""
    text = text.strip()
    # strip ```json ... ``` fences
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fenced:
        text = fenced.group(1).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise AIProviderError("AI response contained no JSON object", status=502, code="AI_INVALID_RESPONSE")
    return json.loads(text[start : end + 1])


async def generate(model_type: Type[T], system_prompt: str, payload: dict, temperature: float = 0.2) -> T:
    """Ask the LLM for JSON and guarantee it satisfies `model_type`."""
    try:
        provider = _get_provider()
    except AINotConfigured as exc:
        raise AINotConfigured() from exc

    raw = await provider.chat_json(system_prompt, payload, temperature=temperature)
    try:
        parsed = _extract_json(raw)
    except json.JSONDecodeError as exc:
        raise AIProviderError("AI response was not valid JSON", status=502, code="AI_INVALID_RESPONSE") from exc

    try:
        return model_type.model_validate(parsed)
    except ValidationError as exc:
        logger.warning("AI output failed schema validation: %s", exc)
        raise AIProviderError(
            "AI response did not match the expected schema — try again",
            status=502,
            code="AI_INVALID_RESPONSE",
        ) from exc


# ── System prompts ────────────────────────────────────────────────
# Instruct the model to produce exactly the JSON shape of the target schema,
# then `generate()` enforces it programmatically.

TASK_BREAKDOWN_SYSTEM = """You are a senior engineering manager inside DevFlow, a developer project &
collaboration platform. Break a feature/epic description into a small set of
well-scoped engineering tasks that a real team could execute.

Return ONLY a JSON object with this exact shape:
{
  "epic": "short epic name",
  "summary": "one short paragraph of the overall plan",
  "tasks": [
    {
      "title": "task title",
      "description": "concise implementation notes",
      "priority": "LOW|MEDIUM|HIGH|URGENT",
      "complexity": "S|M|L|XL",
      "estimatedHours": 1.0,
      "labels": ["backend"]
    }
  ]
}
Guidelines: 5-12 tasks; tasks must be specific and actionable; prefer atomic
tasks that each produce a reviewable diff; include security/review/tests where
they add real value. Never invent credentials or external systems."""

ISSUE_ANALYSIS_SYSTEM = """You are a principal engineer debugging a bug report inside DevFlow.
Analyze the issue and return ONLY JSON with this exact shape:
{
  "possibleCauses": ["...", "..."],
  "severity": "LOW|MEDIUM|HIGH|CRITICAL",
  "suggestedPriority": "LOW|MEDIUM|HIGH|URGENT",
  "suggestedLabels": ["bug"],
  "debuggingSteps": ["1 ...", "2 ..."],
  "suggestedTasks": [{"title": "...", "description": "..."}]
}
Base every cause on the symptoms described; be concrete, never generic filler.
"""

SUMMARY_SYSTEM = """You are an engineering lead generating a weekly summary inside DevFlow.
Analyze the project's real activity data (tasks completed, open issues,
activity counts) and return ONLY JSON with this exact shape:
{
  "overview": "2-4 sentence narrative of the week",
  "highlights": ["top wins / signals"],
  "completed": {"features": 0, "bugFixes": 0, "other": 0},
  "blockers": ["...", "..."],
  "recommendedNextSteps": ["...", "..."],
  "riskFlags": ["..."]
}
Only mention items that are actually present in the data; if there is no data
for the window, say so plainly. Do not invent activity."""

SPRINT_PLAN_SYSTEM = """You are a delivery lead planning a sprint inside DevFlow.
Given the backlog, team workload and capacity, propose which tasks belong in the
next sprint and in what order. Return ONLY JSON with this exact shape:
{
  "sprintName": "Sprint suggestion",
  "summary": "short rationale",
  "suggestedTasks": [
    {"key": "DEV-3", "title": "...", "order": 0, "reason": "...", "suggestedAssignee": "username or null", "estimatedHours": 1.0}
  ],
  "excluded": [{"key": "DEV-9", "reason": "..."}],
  "risks": ["..."],
  "workloadDistribution": [{"username": "...", "plannedHours": 0.0}]
}
Respect priorities, due dates and estimated hours; prefer tasks already in the
current active sprint; keep planned total within team capacity; spread work
across the team based on their existing open workload."""
