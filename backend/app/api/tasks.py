from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.api.auth import verify_admin_key
from app.models.task import TaskQueue
from app.schemas.task import (
    TaskCreate,
    TaskResponse,
    TaskListResponse,
    TaskStatsResponse,
)
from app.services.scheduler import task_scheduler

router = APIRouter(prefix="/api/tasks", tags=["Tasks"])


@router.get("", response_model=TaskListResponse)
async def list_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = Query(None),
    task_type: str | None = Query(None),
    scheduled_date: date | None = Query(None),
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(TaskQueue)

    if status:
        stmt = stmt.where(TaskQueue.status == status)
    if task_type:
        stmt = stmt.where(TaskQueue.task_type == task_type)
    if scheduled_date:
        stmt = stmt.where(TaskQueue.scheduled_date == scheduled_date)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = stmt.order_by(TaskQueue.priority_score.desc())
    offset = (page - 1) * page_size
    stmt = stmt.offset(offset).limit(page_size)

    result = await db.execute(stmt)
    tasks = result.scalars().all()

    return TaskListResponse(
        total=total,
        items=[TaskResponse.model_validate(t) for t in tasks],
        page=page,
        page_size=page_size,
    )


@router.post("/allocate")
async def allocate_tasks(
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    created = await task_scheduler.schedule_daily_tasks(db)
    return {"tasks_created": created}


@router.post("/{task_id}/retry", response_model=TaskResponse)
async def retry_task(
    task_id: int,
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(TaskQueue).where(TaskQueue.id == task_id)
    result = await db.execute(stmt)
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.status not in ("failed", "deferred"):
        raise HTTPException(status_code=400, detail="Only failed or deferred tasks can be retried")

    task.status = "pending"
    task.retry_count = 0
    task.error_message = None
    await db.flush()
    await db.refresh(task)

    return TaskResponse.model_validate(task)


@router.post("/process")
async def process_tasks(
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    processed = await task_scheduler.process_pending_tasks(db)
    return {"tasks_processed": processed}


@router.get("/stats", response_model=TaskStatsResponse)
async def task_stats(
    api_key: str = Depends(verify_admin_key),
    db: AsyncSession = Depends(get_db),
):
    statuses = ["pending", "running", "completed", "failed", "deferred"]
    counts: dict[str, int] = {}
    total = 0

    for s in statuses:
        stmt = select(func.count()).select_from(
            select(TaskQueue).where(TaskQueue.status == s).subquery()
        )
        count = (await db.execute(stmt)).scalar() or 0
        counts[s] = count
        total += count

    return TaskStatsResponse(
        pending=counts["pending"],
        running=counts["running"],
        completed=counts["completed"],
        failed=counts["failed"],
        deferred=counts["deferred"],
        total=total,
    )
