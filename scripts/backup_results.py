import os
import shutil
import json

dest = "artifacts/backup_current_optimal"
os.makedirs(dest, exist_ok=True)

# Copy artifacts
shutil.copy("artifacts/submission.json", os.path.join(dest, "submission.json"))
shutil.copy("artifacts/run-report.json", os.path.join(dest, "run-report.json"))

# Copy database
shutil.copy("var/cleardraft.db", os.path.join(dest, "cleardraft.db"))

meta = {
    "run_id": "e430879f-173c-4997-b187-655f53556198",
    "timestamp": "2026-09-21T17:44:05Z",
    "model": "deepseek-chat",
    "concurrency": 8,
    "accuracy": {
        "category_accuracy": "100.0% (520/520)",
        "status_accuracy": "98.8% (514/520)",
        "exact_match": "98.8% (514/520)",
        "false_clears": 0,
        "false_alarms": 0
    },
    "files_backed_up": ["submission.json", "run-report.json", "cleardraft.db"]
}

with open(os.path.join(dest, "backup_info.json"), "w") as f:
    json.dump(meta, f, indent=2)

print("SUCCESS: Backup created in", dest)
for item in os.listdir(dest):
    size = os.path.getsize(os.path.join(dest, item))
    print(f"  - {item}: {size:,} bytes")
