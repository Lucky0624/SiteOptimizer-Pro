from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.database import create_tables, async_session
from app.api.urls import router as urls_router
from app.api.quota import router as quota_router
from app.api.tasks import router as tasks_router
from app.api.dashboard import router as dashboard_router
from app.api.settings import router as settings_router
from app.api.websites import router as websites_router
from app.services.seo_loop import seo_loop


scheduler = AsyncIOScheduler()


async def run_daily_seo_cycle() -> None:
    async with async_session() as db:
        try:
            await seo_loop.run_full_cycle(db)
            await db.commit()
        except Exception:
            await db.rollback()
            raise


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()
    scheduler.add_job(run_daily_seo_cycle, "cron", hour=2, minute=0, id="seo_daily_cycle")
    scheduler.start()
    yield
    scheduler.shutdown()


app = FastAPI(
    title="SiteOptimizer Pro",
    description="SEO Optimization Tool Backend",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(urls_router)
app.include_router(quota_router)
app.include_router(tasks_router)
app.include_router(dashboard_router)
app.include_router(settings_router)
app.include_router(websites_router)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "SiteOptimizer Pro"}
