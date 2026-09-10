"""Request/response schemas.

Every AI endpoint validates the *incoming* payload and re-validates the LLM's
*outgoing* JSON against these models so the frontend always receives strictly
structured data — never uncontrolled free-form text.
"""
from typing import Literal, Optional

from pydantic import BaseModel, Field

Priority = Literal["LOW", "MEDIUM", "HIGH", "URGENT"]
Severity = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]


# ── Task breakdown ────────────────────────────────────────────────
class TaskBreakdownRequest(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: Optional[str] = Field(default=None, max_length=5000)
    context: Optional[str] = Field(default=None, max_length=2000)


class GeneratedTask(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default="", max_length=2000)
    priority: Priority = "MEDIUM"
    complexity: Optional[str] = Field(default=None, max_length=50)  # e.g. S / M / L / XL
    estimatedHours: Optional[float] = Field(default=None, ge=0, le=1000)
    labels: list[str] = Field(default_factory=list, max_length=8)


class TaskBreakdownResponse(BaseModel):
    epic: str = Field(min_length=1, max_length=120)
    summary: str = Field(default="", max_length=1000)
    tasks: list[GeneratedTask] = Field(min_length=1, max_length=30)


# ── Issue analysis ────────────────────────────────────────────────
class IssueAnalysisRequest(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=3, max_length=8000)
    stepsToReproduce: Optional[str] = Field(default=None, max_length=5000)
    expectedResult: Optional[str] = Field(default=None, max_length=3000)
    actualResult: Optional[str] = Field(default=None, max_length=3000)
    environment: Optional[str] = Field(default=None, max_length=500)


class SuggestedTask(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default="", max_length=1000)


class IssueAnalysisResponse(BaseModel):
    possibleCauses: list[str] = Field(min_length=1, max_length=12)
    severity: Severity
    suggestedPriority: Priority
    suggestedLabels: list[str] = Field(default_factory=list, max_length=10)
    debuggingSteps: list[str] = Field(default_factory=list, max_length=12)
    suggestedTasks: list[SuggestedTask] = Field(default_factory=list, max_length=12)


# ── Project summary ───────────────────────────────────────────────
class SummaryTask(BaseModel):
    key: str
    title: str
    labels: list[str] = Field(default_factory=list)
    estimatedHours: float = 0
    assignee: Optional[str] = None


class SummaryIssue(BaseModel):
    key: str
    title: str
    type: str
    priority: str
    severity: str


class ProjectSummaryRequest(BaseModel):
    project: dict = Field(default_factory=dict)
    days: int = Field(default=14, ge=1, le=90)
    window: Optional[dict] = None
    completedTasks: list[SummaryTask] = Field(default_factory=list)
    completedCount: int = 0
    completedBreakdown: Optional[dict] = None
    openIssues: list[SummaryIssue] = Field(default_factory=list)
    activityStats: Optional[dict] = None
    teamSize: int = 0
    linkedRepositories: list[str] = Field(default_factory=list)


class ProjectSummaryResponse(BaseModel):
    overview: str = Field(min_length=1, max_length=2000)
    highlights: list[str] = Field(default_factory=list, max_length=8)
    completed: dict = Field(default_factory=dict)
    blockers: list[str] = Field(default_factory=list, max_length=10)
    recommendedNextSteps: list[str] = Field(default_factory=list, max_length=10)
    riskFlags: list[str] = Field(default_factory=list, max_length=8)


# ── Sprint planning ───────────────────────────────────────────────
class PlanTask(BaseModel):
    key: str
    title: str
    status: Optional[str] = "TODO"
    priority: Optional[str] = "MEDIUM"
    dueDate: Optional[str] = None
    estimatedHours: float = 0
    sprint: Optional[str] = None
    labels: list[str] = Field(default_factory=list)
    assignee: Optional[dict] = None


class TeamMember(BaseModel):
    userId: Optional[str] = None
    name: Optional[str] = None
    username: Optional[str] = None
    openHours: float = 0
    openTasks: int = 0


class SprintPlanRequest(BaseModel):
    projectName: Optional[str] = None
    sprintDays: int = Field(default=14, ge=3, le=30)
    tasks: list[PlanTask] = Field(default_factory=list, max_length=120)
    team: list[TeamMember] = Field(default_factory=list)
    teamCapacityHours: float = 0


class PlannedTask(BaseModel):
    key: str
    title: str
    order: int = Field(ge=0, le=1000)
    reason: Optional[str] = Field(default="", max_length=300)
    suggestedAssignee: Optional[str] = Field(default=None, max_length=60)
    estimatedHours: float = 0


class PlannedExclusion(BaseModel):
    key: str
    reason: str = Field(max_length=300)


class SprintPlanResponse(BaseModel):
    sprintName: str = Field(default="", max_length=120)
    summary: str = Field(default="", max_length=1000)
    suggestedTasks: list[PlannedTask] = Field(default_factory=list, max_length=60)
    excluded: list[PlannedExclusion] = Field(default_factory=list, max_length=40)
    risks: list[str] = Field(default_factory=list, max_length=10)
    workloadDistribution: list[dict] = Field(default_factory=list)
