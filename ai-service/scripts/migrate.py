#!/usr/bin/env python3
"""
Standalone CLI Migration Tool for AI Biometrics Microservice.
Usage: python3 scripts/migrate.py
"""

import sys
import os

# Add parent directory to python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.migrations import run_migrations

if __name__ == "__main__":
    print("🚀 Running AI Biometrics Microservice Standalone Database Migration...")
    try:
        run_migrations()
        print("✅ AI Database Migrations Successful!")
    except Exception as e:
        print(f"❌ AI Database Migration Failed: {str(e)}")
        sys.exit(1)
