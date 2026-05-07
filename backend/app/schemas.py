from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class SourceField(BaseModel):
    value: str
    source_text: str


class CaseIdentity(BaseModel):
    case_type: SourceField
    case_number: SourceField
    year: SourceField
    bench: SourceField
    judge: SourceField
    department: SourceField = SourceField(value="Not Specified", source_text="Not found in judgment")


class Dates(BaseModel):
    reserved_on: SourceField
    pronounced_on: SourceField
    order_date: SourceField
    relist_on: SourceField = SourceField(value="Not Specified", source_text="Not found in judgment")


class Verdict(BaseModel):
    value: str
    source_text: str


class OperativeParagraph(BaseModel):
    para_number: int
    direction: str
    source_text: str


class ComplianceTask(BaseModel):
    task_id: str
    description: str
    status: str
    priority: str
    deadline: str
    source_text: str
    operative_para: int = 0
    department: str = "Not Specified"
    days_overdue: int = 0
    contempt_risk: bool = False


class AppealReview(BaseModel):
    limitation_period: str
    review_deadline: str
    filing_deadline: str
    appeal_status: str = "AVAILABLE"
    notes: str = ""
    finality_notes: str = ""
    source_text: str


class Milestone(BaseModel):
    label: str
    date: str
    description: str


class Tracking(BaseModel):
    t_zero: str
    milestones: list[Milestone]


class ActionPlan(BaseModel):
    compliance_tasks: list[ComplianceTask]
    appeal_review: AppealReview
    tracking: Tracking


class JudgmentAnalysisResponse(BaseModel):
    case_identity: CaseIdentity
    dates: Dates
    verdict: Verdict
    operative_paragraphs: list[OperativeParagraph]
    action_plan: ActionPlan
    verification_status: str = "PENDING_HUMAN_VERIFICATION"
    generated_on: str
    protocol_version: str = "CCMS-AI v1.0"


class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None
