import os
import subprocess
import tempfile
import fitz
from loguru import logger


class PDFExtractor:
    """Extracts text and metadata from PDF documents using PyMuPDF.
    Automatically falls back to OCRmyPDF when text extraction yields poor results.
    """

    def __init__(self, max_pages: int = 200, enable_ocr: bool = True, min_chars_per_page: int = 50):
        self.max_pages = max_pages
        self.enable_ocr = enable_ocr
        self.min_chars_per_page = min_chars_per_page

    def extract(self, pdf_path: str) -> dict:
        result = self._try_standard_extract(pdf_path)

        quality = self._assess_quality(result)

        if quality == "poor" and self.enable_ocr:
            logger.info(
                f"Standard extraction quality poor ({result['avg_chars_per_page']} chars/page). "
                f"Running OCRmyPDF..."
            )
            ocr_result = self._run_ocr_and_extract(pdf_path)
            if ocr_result:
                ocr_quality = self._assess_quality(ocr_result)
                if ocr_quality != "poor":
                    logger.info(
                        f"OCR extraction superior: {ocr_result['avg_chars_per_page']} chars/page "
                        f"vs {result['avg_chars_per_page']} chars/page"
                    )
                    return ocr_result
                else:
                    logger.warning("OCR also produced poor results, returning standard extraction")
            else:
                logger.warning("OCRmyPDF failed or is not installed")

        return result

    def _assess_quality(self, result: dict) -> str:
        """Assess extraction quality based on average chars per page."""
        avg = result.get("avg_chars_per_page", 0)
        if avg >= self.min_chars_per_page:
            return "good"
        elif avg > 10:
            return "degraded"
        else:
            return "poor"

    def _try_standard_extract(self, pdf_path: str) -> dict:
        """Attempt text extraction using PyMuPDF."""
        doc = fitz.open(pdf_path)
        try:
            page_count = min(len(doc), self.max_pages)
            full_text = []
            page_texts = []
            total_chars = 0

            for i in range(page_count):
                page = doc[i]
                text = page.get_text("text")
                full_text.append(text)
                page_texts.append({
                    "page_number": i + 1,
                    "text": text,
                })
                total_chars += len(text.strip())

            combined_text = "\n\n".join(full_text)
            metadata = doc.metadata
            toc = doc.get_toc()

            avg_chars = total_chars / page_count if page_count > 0 else 0

            logger.info(
                f"Extracted {page_count} pages, {len(combined_text)} chars "
                f"(avg {avg_chars:.0f}/page) from PDF"
            )

            return {
                "full_text": combined_text,
                "page_texts": page_texts,
                "total_pages": page_count,
                "total_chars": total_chars,
                "avg_chars_per_page": avg_chars,
                "metadata": metadata,
                "toc": toc,
                "ocr_used": False,
            }
        finally:
            doc.close()

    def _run_ocr_and_extract(self, pdf_path: str) -> dict | None:
        """Run OCRmyPDF on the input PDF and extract text from the OCR'd version."""
        ocr_output = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False).name

        try:
            result = subprocess.run(
                [
                    "ocrmypdf",
                    "--output-type", "pdf",
                    "--language", "eng+hin",
                    "--pages", f"1-{self.max_pages}",
                    "--force-ocr",
                    "--optimize", "1",
                    pdf_path,
                    ocr_output,
                ],
                capture_output=True,
                text=True,
                timeout=300,
            )

            if result.returncode == 0:
                logger.info(f"OCRmyPDF completed: {result.stdout.strip()}")
                ocr_result = self._try_standard_extract(ocr_output)
                ocr_result["ocr_used"] = True
                return ocr_result
            else:
                logger.error(f"OCRmyPDF failed: {result.stderr}")
                return None

        except FileNotFoundError:
            logger.error(
                "ocrmypdf command not found. Install via: "
                "pip install ocrmypdf (requires Tesseract: https://github.com/tesseract-ocr/tesseract)"
            )
            return None
        except subprocess.TimeoutExpired:
            logger.error("OCRmyPDF timed out after 300 seconds")
            return None
        except Exception as e:
            logger.error(f"OCRmyPDF error: {e}")
            return None
        finally:
            if os.path.exists(ocr_output):
                os.remove(ocr_output)

    def extract_text_only(self, pdf_path: str) -> str:
        """Quick extraction of combined text only."""
        result = self.extract(pdf_path)
        return result["full_text"]
