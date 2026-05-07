from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
import sys

from app.config import settings
from app.routes.analysis import router as analysis_router

logger.remove()
logger.add(
    sys.stderr,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
    level="DEBUG" if settings.debug else "INFO",
)

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="CCMS-AI backend for analyzing court judgments and generating structured action plans.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analysis_router)


@app.on_event("startup")
async def startup_event():
    logger.info(f"{settings.app_name} v{settings.app_version} starting")
    logger.info(f"LLM Provider: {settings.llm_provider}")
    logger.info(f"Max PDF pages: {settings.max_pdf_pages}")
    logger.info(f"Upload directory: {settings.upload_dir}")


@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down")
