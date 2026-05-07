@echo off
echo Starting CCMS-AI Backend...
cd /d "%~dp0"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
