import os
import uuid
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, HTTPException, status
from fastapi.responses import JSONResponse
from loguru import logger

from app.config import settings
from app.services.pdf_extractor import PDFExtractor
from app.services.llm_analyzer import LLMAnalyzer
from app.services.action_plan_generator import ActionPlanGenerator

router = APIRouter(prefix="/api", tags=["judgment-analysis"])

pdf_extractor = PDFExtractor(
    max_pages=settings.max_pdf_pages,
    enable_ocr=settings.enable_ocr,
    min_chars_per_page=settings.ocr_min_chars_per_page,
)
llm_analyzer = LLMAnalyzer()
action_plan_generator = ActionPlanGenerator()

ALLOWED_EXTENSIONS = {".pdf"}
MAX_FILE_SIZE = settings.max_pdf_size_mb * 1024 * 1024


@router.post(
    "/analyze-judgment",
    summary="Analyze a court judgment PDF and return structured action plan",
    responses={
        200: {"description": "Successfully analyzed judgment"},
        400: {"description": "Invalid file or extraction failed"},
        500: {"description": "Internal server error"},
    },
)
async def analyze_judgment(file: UploadFile = File(...)):
    request_id = str(uuid.uuid4())[:8]
    logger.info("Received file: {}", file.filename, request_id=request_id)

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF files are accepted",
        )

    upload_path = os.path.join(settings.upload_dir, f"{request_id}_{file.filename}")
    os.makedirs(settings.upload_dir, exist_ok=True)

    try:
        file_size = 0
        with open(upload_path, "wb") as buffer:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                file_size += len(chunk)
                if file_size > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"File size exceeds {settings.max_pdf_size_mb}MB limit",
                    )
                buffer.write(chunk)

        logger.info("Saved to {} ({} bytes)", upload_path, file_size, request_id=request_id)

        logger.info("Extracting text from PDF...", request_id=request_id)
        extracted = pdf_extractor.extract(upload_path)
        extracted_text = extracted["full_text"]

        if not extracted_text.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not extract any text from the PDF. It may be image-only.",
            )

        logger.info(
            "Extracted {} chars from {} pages",
            len(extracted_text),
            extracted["total_pages"],
            request_id=request_id,
        )

        logger.info("Sending to LLM for analysis...", request_id=request_id)

        if not extracted_text.strip():
            logger.warning("No text extracted, using raw binary as fallback", request_id=request_id)
            extracted_text = "PDF text extraction failed. No readable text found in document."

        try:
            llm_output = llm_analyzer.analyze(extracted_text)
        except Exception as llm_error:
            logger.error(f"LLM analysis failed: {llm_error}", request_id=request_id)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"LLM analysis failed: {str(llm_error)}",
            )

        logger.info("Generating action plan...", request_id=request_id)
        result = action_plan_generator.validate_and_enrich(llm_output)

        result["meta"] = {
            "request_id": request_id,
            "filename": file.filename,
            "total_pages": extracted["total_pages"],
            "chars_extracted": len(extracted_text),
            "processed_at": datetime.now().isoformat(),
        }

        logger.info("Analysis complete", request_id=request_id)

        return JSONResponse(content=result)

    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        logger.error("Error: {}", error_msg, request_id=request_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Analysis failed: {error_msg}",
        )
    finally:
        if os.path.exists(upload_path):
            os.remove(upload_path)
            logger.info("Cleaned up {}", upload_path, request_id=request_id)


@router.get("/health", summary="Health check")
async def health_check():
    return {
        "status": "healthy",
        "app": settings.app_name,
        "version": settings.app_version,
        "llm_provider": settings.llm_provider,
        "groq_model": settings.groq_model,
        "groq_api_key_configured": bool(settings.groq_api_key),
        "enable_ocr": settings.enable_ocr,
        "timestamp": datetime.now().isoformat(),
    }


@router.get("/debug", summary="Debug endpoint")
async def debug_info():
    return {
        "llm_provider": settings.llm_provider,
        "groq_api_key_set": bool(settings.groq_api_key),
        "groq_model": settings.groq_model,
        "enable_ocr": settings.enable_ocr,
        "max_pdf_pages": settings.max_pdf_pages,
        "max_pdf_size_mb": settings.max_pdf_size_mb,
    }
