from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    ADMIN_KEY: str
    DEBUG: bool = False
    GOOGLE_CLIENT_EMAIL: str = ""
    GOOGLE_PRIVATE_KEY: str = ""
    GOOGLE_SITE_URL: str = ""
    CREDENTIAL_ENCRYPTION_KEY: str = ""
    DATABASE_URL: str = "sqlite+aiosqlite:///./siteoptimizer.db"
    GSC_DAILY_LIMIT: int = 100000
    INSPECTION_DAILY_LIMIT: int = 2000
    INDEXING_DAILY_LIMIT: int = 200
    GOOGLE_PSI_API_KEY: str = ""
    GA4_PROPERTY_ID: str = ""
    DINGTALK_WEBHOOK_URL: str = ""
    WECOM_WEBHOOK_URL: str = ""
    LCP_THRESHOLD_MS: float = 2500.0
    # CORS：生产环境设置为前端域名，如 "https://your-app.com"
    # 多个域名用逗号分隔："https://a.com,https://b.com"
    ALLOWED_ORIGINS: str = "*"

    @property
    def cors_origins(self) -> list[str]:
        if self.ALLOWED_ORIGINS == "*":
            return ["*"]
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
