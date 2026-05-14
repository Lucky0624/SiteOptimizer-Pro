from datetime import date, datetime

from pydantic import BaseModel, Field


class TaskCreate(BaseModel):
    url_id: int = Field(..., description="URL record ID")
    task_type: str = Field(..., description="Task type: inspection/indexing/gsc_fetch")
    priority_score: float = Field(0.0, description="Priority score")
    scheduled_date: date = Field(..., description="Scheduled execution date")


class TaskResponse(BaseModel):
    id: int
    url_id: int
    task_type: str
    priority_score: float
    status: str
    scheduled_date: date
    executed_at: datetime | None
    result_summary: str | None
    error_message: str | None
    retry_count: int
    max_retries: int
    created_at: datetime

    model_config = {"from_attributes": True}


class TaskListResponse(BaseModel):
    total: int
    items: list[TaskResponse]
    page: int
    page_size: int


class TaskStatsResponse(BaseModel):
    pending: int
    running: int
    completed: int
    failed: int
    deferred: int
    total: int
