#!/usr/bin/env python3
"""Cross-platform script to start the CCMS-AI Backend."""
import os
import sys
import subprocess

def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    print("Starting CCMS-AI Backend...")
    cmd = [
        sys.executable, "-m", "uvicorn",
        "app.main:app",
        "--reload",
        "--host", "0.0.0.0",
        "--port", "8000"
    ]
    try:
        subprocess.run(cmd)
    except KeyboardInterrupt:
        print("\nServer stopped.")
        sys.exit(0)

if __name__ == "__main__":
    main()
