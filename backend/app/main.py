import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.database import create_tables, async_session
from app.config import settings
from app.api.urls import router as urls_router
from app.api.quota import router as quota_router
from app.api.tasks import router as tasks_router
from app.api.dashboard import router as dashboard_router
from app.api.settings import router as settings_router
from app.api.websites import router as websites_router
from app.api.cms import router as cms_router
from app.api.keywords import router as keywords_router
from app.services.google_api import google_api_client
from app.services.secret_storage import migrate_legacy_secrets
from app.services.seo_loop import seo_loop

# 配置全局日志
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()
FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


async def run_daily_seo_cycle() -> None:
    async with async_session() as db:
        try:
            await seo_loop.run_full_cycle(db)
            await db.commit()
        except Exception as e:
            await db.rollback()
            logger.exception("Daily SEO cycle failed: %s", e)
            # 修复P0：基础设施崩溃（如 DB 连接失败）也能触发告警
            try:
                from app.utils.alert_utils import alert_manager
                async with async_session() as alert_db:
                    await alert_manager.alert_seo_cycle_failed(str(e), alert_db)
                    await alert_db.commit()
            except Exception as alert_err:
                logger.error("Failed to send crash alert: %s", alert_err)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()
    migrated_secret_count = await migrate_legacy_secrets()
    if migrated_secret_count:
        logger.info("Migrated %d legacy secret value(s) to protected local storage.", migrated_secret_count)
    scheduler.add_job(run_daily_seo_cycle, "cron", hour=2, minute=0, id="seo_daily_cycle")
    scheduler.start()
    logger.info("SiteOptimizer Pro started. Scheduler running.")
    yield
    scheduler.shutdown()
    await google_api_client.close()
    logger.info("SiteOptimizer Pro shutting down.")


app = FastAPI(
    title="SiteOptimizer Pro",
    description="SEO Optimization Tool Backend",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
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
app.include_router(cms_router)
app.include_router(keywords_router)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "SiteOptimizer Pro"}


if FRONTEND_DIST.exists():
    app.mount(
        "/assets",
        StaticFiles(directory=FRONTEND_DIST / "assets"),
        name="frontend-assets",
    )


@app.get("/{full_path:path}", include_in_schema=False)
async def serve_frontend(full_path: str):
    if full_path == "api" or full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API endpoint not found")
    if not FRONTEND_DIST.exists():
        raise HTTPException(status_code=404, detail="Frontend build not found")

    requested_path = (FRONTEND_DIST / full_path).resolve()
    try:
        requested_path.relative_to(FRONTEND_DIST)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="File not found") from exc

    if requested_path.is_file():
        return FileResponse(requested_path)

    return FileResponse(FRONTEND_DIST / "index.html")
