from pydantic_settings import BaseSettings
from typing import Literal


class Settings(BaseSettings):
    app_name: str = "CCMS-AI Judgment Analyzer"
    app_version: str = "1.0.0"
    debug: bool = False

    llm_provider: Literal["groq", "anthropic"] = "groq"
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-3-sonnet-20240229"
    anthropic_base_url: str | None = None

    max_pdf_pages: int = 200
    max_pdf_size_mb: int = 50
    upload_dir: str = "uploads"
    enable_ocr: bool = True
    ocr_min_chars_per_page: int = 50

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
