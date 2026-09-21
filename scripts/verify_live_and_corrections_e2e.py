import urllib.request
import json
import time

print("Checking FastAPI backend on port 8000...")
try:
    with urllib.request.urlopen("http://localhost:8000/api/v1/readiness", timeout=3) as r:
        print("Backend readiness:", r.status, r.read().decode())
except Exception as e:
    print("Backend 8000 not running directly, testing with python subprocess or uvicorn:", e)

print("\nChecking Next.js web server on port 5173...")
try:
    with urllib.request.urlopen("http://localhost:5173/live", timeout=3) as r:
        print("Frontend /live:", r.status)
except Exception as e:
    print("Frontend 5173 /live:", e)
