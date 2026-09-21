# Dependency inventory

Direct Python dependencies are declared in `pyproject.toml` with bounded
version ranges. The web workspace is locked by `apps/web/package-lock.json`.
Before a release, record the resolved output from `pip freeze` and `npm ls
--all` so the judge can reproduce the exact environment.

| Dependency | Use | License family |
| --- | --- | --- |
| FastAPI, Uvicorn, Pydantic | API and typed validation | MIT |
| python-multipart | Upload parsing | Apache-2.0 |
| python-dotenv | Local `.env` loading | BSD-3-Clause |
| PyMuPDF | PDF text, geometry, and OCR bridge | AGPL/commercial; verify the selected distribution license before redistribution |
| python-docx | DOCX paragraph/table extraction | MIT |
| openpyxl | XLSX cell extraction | MIT |
| React, React DOM, React Router | Review workspace UI | MIT |
| Vite, TypeScript | Web build and type checking | MIT |
| lucide-react | Accessible SVG icons | ISC |

The application does not require a GPU, vector database, or autonomous-agent
runtime. Tesseract is an optional system executable used by PyMuPDF OCR and
must be installed and licensed separately where scanned-PDF recovery is
enabled.

