"""The four AI capabilities, exposed as structured JSON endpoints."""
import json
import logging
from typing import Any

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from ..schemas import (
    IssueAnalysisRequest,
    IssueAnalysisResponse,
    ProjectSummaryRequest,
    ProjectSummaryResponse,
    SprintPlanRequest,
    SprintPlanResponse,
    TaskBreakdownRequest,
    TaskBreakdownResponse,
)
from ..services.ai_service import (
    AINotConfigured,
    AIProviderError,
    ISSUE_ANALYSIS_SYSTEM,
    SPRINT_PLAN_SYSTEM,
    SUMMARY_SYSTEM,
    TASK_BREAKDOWN_SYSTEM,
    generate,
)

logger = logging.getLogger("devflow.ai")
router = APIRouter(prefix="/ai", tags=["ai"])


def _to_error(status: int, code: str, message: str, details: Any = None) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message, "details": details}})


def _wrap(exc: BaseException) -> JSONResponse:
    if isinstance(exc, AINotConfigured):
        return _to_error(503, "AI_NOT_CONFIGURED", "AI features are not configured. Add an AI provider to the Python service.")
    if isinstance(exc, AIProviderError):
        return _to_error(exc.status, exc.code, exc.message)
    logger.exception("unexpected AI error")
    return _to_error(500, "AI_ERROR", "Internal AI service error")


@router.post("/task-breakdown", response_model=TaskBreakdownResponse)
async def task_breakdown(req: TaskBreakdownRequest) -> TaskBreakdownResponse:
    payload = req.model_dump(exclude_none=True)
    try:
        return await generate(TaskBreakdownResponse, TASK_BREAKDOWN_SYSTEM, payload)
    except (AINotConfigured, AIProviderError) as exc:
        return _wrap(exc)


@router.post("/analyze-issue", response_model=IssueAnalysisResponse)
async def analyze_issue(req: IssueAnalysisRequest) -> IssueAnalysisResponse:
    payload = req.model_dump(exclude_none=True)
    try:
        return await generate(IssueAnalysisResponse, ISSUE_ANALYSIS_SYSTEM, payload)
    except (AINotConfigured, AIProviderError) as exc:
        return _wrap(exc)


@router.post("/project-summary", response_model=ProjectSummaryResponse)
async def project_summary(req: ProjectSummaryRequest) -> ProjectSummaryResponse:
    payload = req.model_dump(exclude_none=True)
    try:
        return await generate(ProjectSummaryResponse, SUMMARY_SYSTEM, payload)
    except (AINotConfigured, AIProviderError) as exc:
        return _wrap(exc)


@router.post("/sprint-plan", response_model=SprintPlanResponse)
async def sprint_plan(req: SprintPlanRequest) -> SprintPlanResponse:
    payload = req.model_dump(exclude_none=True)
    try:
        return await generate(SprintPlanResponse, SPRINT_PLAN_SYSTEM, payload)
    except (AINotConfigured, AIProviderError) as exc:
        return _wrap(exc)
