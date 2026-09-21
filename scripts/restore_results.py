import os
import shutil

src = "artifacts/backup_current_optimal"

if not os.path.exists(src):
    raise FileNotFoundError(f"Backup directory {src} not found!")

shutil.copy(os.path.join(src, "submission.json"), "artifacts/submission.json")
shutil.copy(os.path.join(src, "run-report.json"), "artifacts/run-report.json")
shutil.copy(os.path.join(src, "cleardraft.db"), "var/cleardraft.db")

print("SUCCESS: Restored current optimal results:")
print("  - artifacts/submission.json")
print("  - artifacts/run-report.json")
print("  - var/cleardraft.db")
