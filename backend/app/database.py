from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with async_session() as session:
        async with session.begin():
            yield session


async def create_tables() -> None:
    import app.models  # noqa: F401 - ensure all SQLAlchemy models are registered
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        if engine.dialect.name == "sqlite":
            result = await conn.exec_driver_sql("PRAGMA table_info(website)")
            columns = {row[1] for row in result.fetchall()}
            for column in ("gsc_verified_at", "cms_verified_at"):
                if column not in columns:
                    await conn.exec_driver_sql(f"ALTER TABLE website ADD COLUMN {column} DATETIME")
