# HVI OCR System

Offline cotton quality report OCR pipeline. Upload a PDF or image → auto-extract values → review in browser → save to PostgreSQL.

---

## Quick Start

### 1. Install dependencies

```bash
cd /Users/abhayrohit/College/QBIC/OCR1

# Reuse existing venv from /OCR, or create a new one:
python3 -m venv venv
source venv/bin/activate

pip install -r requirements.txt
```

> **PDF support** requires Poppler: `brew install poppler`

---

### 2. Configure database

```bash
cp .env.example .env
# Edit .env and set your actual DATABASE_URL:
# DATABASE_URL=postgresql://user:password@localhost:5432/your_db
```

If you don't have PostgreSQL yet, the OCR pipeline still works — you'll just see a warning when saving. You can add the DB later.

---

### 3. Run the server

```bash
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Open: **http://localhost:8000**

---

## Usage

1. **Upload** — drag-drop or browse for an HVI report (JPG, PNG, or PDF)
2. **Run OCR** — click the button; watch step-by-step logs in real time
3. **Review** — check raw OCR text, extracted table, and JSON output
4. **Edit** — correct any misread values in the form
5. **Save** — submit to PostgreSQL

---

## Architecture

```
OCR1/
├── main.py          # FastAPI app + SSE streaming endpoint
├── ocr/
│   └── engine.py    # RapidOCR wrapper (offline, bbox-aware)
├── hvi/
│   ├── parser.py    # Table reconstruction (header detection + column assignment)
│   └── mapper.py    # Exact field mapping to UI names
├── db/
│   └── postgres.py  # PostgreSQL persistence
└── static/
    ├── index.html   # Single-page UI
    ├── styles.css
    └── app.js
```

### Adding AFIS later

Create `afis/parser.py` and `afis/mapper.py` following the same pattern as `hvi/`. Add a new route `/api/afis/ocr` in `main.py`. The OCR engine is shared.

---

## Field Mapping

| UI Field     | HVI Column | Confidence |
|--------------|------------|------------|
| SCI          | SCI        | exact      |
| Mic          | Mic        | exact      |
| Maturity     | Mat        | exact      |
| UR           | UR         | exact      |
| Yellow + B   | +b         | exact      |
| RD           | Rd         | exact      |
| Colour Grade | CGrd       | exact      |

---

## Database Schema

```sql
CREATE TABLE hvi_records (
    id           SERIAL PRIMARY KEY,
    filename     TEXT,
    ocr_json     JSONB,   -- auto-extracted values
    manual_json  JSONB,   -- user-confirmed values
    created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Environment Variables

| Variable            | Required | Description                              |
|---------------------|----------|------------------------------------------|
| `DATABASE_URL`      | Yes      | `postgresql://user:pass@host:5432/db`    |
| `RAPIDOCR_MODEL_DIR`| No       | Path to local ONNX models (optional)     |
