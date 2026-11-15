"""App settings, read once from the environment and the repo-root `.env` file.

Every module reads configuration from `get_settings()`, never from `os.environ` directly.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_ROOT.parent
VAR_DIR = BACKEND_ROOT / "var"  # git-ignored runtime data (SQLite file, saved runs)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=REPO_ROOT / ".env", extra="ignore", populate_by_name=True)

    environment: str = Field("development", alias="AGROMIND_ENV")

    # Unset means a local SQLite file, so the API runs with no database server.
    # Set it to the Postgres URL in .env.example to use docker-compose's PostGIS.
    database_url: str = Field(f"sqlite:///{VAR_DIR / 'agromind.db'}", alias="DATABASE_URL")
    database_echo: bool = Field(False, alias="DATABASE_ECHO")

    # NoDecode: the value is comma-separated (see .env.example), not JSON; _split_csv parses it.
    cors_origins: Annotated[list[str], NoDecode] = Field(["http://localhost:5173", "http://127.0.0.1:5173"], alias="AGROMIND_CORS_ORIGINS")

    earthdata_username: str = Field("", alias="EARTHDATA_USERNAME")
    earthdata_password: str = Field("", alias="EARTHDATA_PASSWORD")
    # AI advisor (shared/advisor/client.py). Provider is guessed from the key when LLM_PROVIDER is unset.
    llm_api_key: str = Field("", alias="LLM_API_KEY")
    llm_provider: str = Field("", alias="LLM_PROVIDER")            # groq | gemini | openrouter | anthropic
    llm_model: str = Field("", alias="LLM_MODEL")                  # empty: the provider's default
    llm_spare_model: str = Field("", alias="LLM_SPARE_MODEL")      # used when the main model's quota runs out
    llm_base_url: str = Field("", alias="LLM_BASE_URL")            # any OpenAI-compatible API
    llm_reasoning_effort: str = Field("low", alias="LLM_REASONING_EFFORT")  # empty for models without it

    @field_validator("database_url")
    @classmethod
    def _use_psycopg3(cls, v: str) -> str:
        # Plain postgresql:// would make SQLAlchemy look for psycopg2; we ship psycopg 3.
        for prefix in ("postgresql://", "postgres://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix):]
        return v

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_csv(cls, v):
        return [o.strip() for o in v.split(",") if o.strip()] if isinstance(v, str) else v

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
