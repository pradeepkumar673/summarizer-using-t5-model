from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import model_validator


class Settings(BaseSettings):
    mongodb_uri: str
    mongodb_db_name: str = "pdf_notes_platform"
    jwt_secret: str = "changeme"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24
    frontend_origin: str = "http://localhost:5173"
    upload_dir: str = "uploads"
    groq_api_key: str = ""
    redis_url: str = "redis://localhost:6379/0"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    @model_validator(mode="after")
    def _check_jwt_secret(self) -> "Settings":
        if self.jwt_secret == "changeme":
            raise ValueError(
                "JWT_SECRET must be set to a strong random value in your .env file. "
                "Do NOT use the default 'changeme' in any environment."
            )
        return self


settings = Settings()
