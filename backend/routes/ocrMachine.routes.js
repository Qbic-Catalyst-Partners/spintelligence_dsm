const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs/promises');
const os = require('os');
const { spawn } = require('child_process');
const db = require('../connection');

const router = express.Router();
const upload = multer({ limits: { fileSize: 20 * 1024 * 1024 } });

const OCR_TIMEOUT_MS = Number(process.env.OCR_UPSTREAM_TIMEOUT_MS || 15000);
const OCR_LOCAL_TIMEOUT_MS = Number(process.env.OCR_LOCAL_TIMEOUT_MS || 240000);
const OCR_STREAM_TIMEOUT_MS = Number(process.env.OCR_STREAM_TIMEOUT_MS || OCR_LOCAL_TIMEOUT_MS);
const OCR_PYTHON = (process.env.OCR_PYTHON_PATH || '').trim();
const OCR_SCRIPT = path.join(__dirname, '..', 'ocr_service', 'run_ocr_pipeline.py');
const HVI_FIELDS = [
  'SCI',
  'Span Length (2.5%)',
  'Mic',
  'Maturity',
  'UR',
  'SFI',
  'Elongation',
  'Yellow + B',
  'RD',
  'Colour Grade',
  'TrCnt',
  'TrAr',
  'TrID',
];
const AFIS_FIELDS = [
  'UQL',
  'L5%',
  'SFC(N)',
  'IFC %',
  'Fibre Neps Gms',
  'SFC(W)',
  'Maturity',
  'Fineness',
  'SCN (gms)',
];
const FIBRE_FIELDS = [
  'Inspection Date',
  'Lot No',
  'Variety',
  'Invoice No',
  'Invoice Date',
  'Cut Length',
  'Length CV',
  'Mean Denier',
  'CV per Denier',
  'Tenacity',
  'CV per Tenacity',
  'Elongation',
  'CV per Elongation',
  'Crimp (ARC/CM)',
  'Whiteness Index',
  'Spin Finish',
];
const BWC_ENTRY_COUNT = 100;
const BWC_FIELDS = [
  ...Array.from({ length: BWC_ENTRY_COUNT }, (_, i) => `Sample Weight ${i + 1}`),
  ...Array.from({ length: BWC_ENTRY_COUNT }, (_, i) => `Hank ${i + 1}`),
];
const MACHINE_DOC_TYPES = new Set(['drawing', 'carding', 'simplex']);
const MACHINE_FIELDS = [
  'S.No',
  'Date',
  'ID',
  'Mac Name',
  'Shift',
  'Std. Hank',
  'Avg. Hank',
  'SD',
  'CV',
  'User',
  'Remark',
];
const APCT_FIELDS = [
  'Row Type',
  'Label',
  'Sample No',
  'N-1',
  'N',
  'N+1',
  'Standard A%',
  'A% (N-1)',
  'A% (N+1)',
  'Total Test',
  'Number of Entries (N)',
];
const NOILS_FIELDS = [
  'Row Type',
  'Label',
  'Sample No',
  'Sliver Wt',
  'Noils Wt',
  'Noils %',
  'Std. Noils %',
  'Total Test',
  'Number of Entries (N)',
];
const STRECH_FIELDS = [
  'Table No',
  'Row Type',
  'Label',
  'Test ID',
  'Total Test',
  'Number of Entries (N)',
  'Length',
  'Std. Stretch %',
  'Stretch %',
  'Remark',
  'Sample No',
  'Initial Bobbin',
  'Full Bobbin',
];
let hviTableReady = false;
let machineTableReady = false;

router.use('/', express.static(path.join(__dirname, '..', 'public', 'ocr-machine')));

router.get('/apct', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'ocr-machine', 'apct.html'));
});

router.get('/noils', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'ocr-machine', 'noils.html'));
});

router.get('/strech', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'ocr-machine', 'strech.html'));
});

router.get('/stretch', (req, res) => {
  res.redirect(302, './strech');
});

function getFieldNames(docType = 'hvi') {
  const normalizedDocType = normalizeDocType(docType);
  if (normalizedDocType === 'fibre') return FIBRE_FIELDS;
  if (normalizedDocType === 'afis') return AFIS_FIELDS;
  if (normalizedDocType === 'bwc') return BWC_FIELDS;
  if (normalizedDocType === 'apct') return APCT_FIELDS;
  if (normalizedDocType === 'noils') return NOILS_FIELDS;
  if (normalizedDocType === 'strech') return STRECH_FIELDS;
  return HVI_FIELDS;
}

function normalizeDocType(docType = 'hvi') {
  const normalized = String(docType || 'hvi').toLowerCase().replace(/[-\s]+/g, '_');
  if (normalized === 'fiber' || normalized === 'fibre') return 'fibre';
  if (normalized.includes('fiber') || normalized.includes('fibre')) return 'fibre';
  if (normalized === 'stretch' || normalized === 'stretch%') return 'strech';
  if (normalized === 'strech' || normalized === 'strech%') return 'strech';
  if (normalized.includes('stretch')) return 'strech';
  if (normalized.includes('noils') || normalized.includes('nolis')) return 'noils';
  if (normalized.includes('comber') && (normalized.includes('noils') || normalized.includes('nolis'))) return 'noils';
  return normalized;
}

function looksLikeApctFilename(filename = '') {
  const name = String(filename || '').toLowerCase().replace(/[_-]+/g, ' ');
  return /\ba\s*%/.test(name) || /\bapct\b/.test(name);
}

function looksLikeNoilsFilename(filename = '') {
  const name = String(filename || '').toLowerCase().replace(/[_-]+/g, ' ');
  return /\b(comber|noils|nolis)\b/.test(name);
}

function looksLikeStrechFilename(filename = '') {
  const name = String(filename || '').toLowerCase().replace(/[_-]+/g, ' ');
  return /\b(stretch|strech|stretch%)\b/.test(name);
}

function getRequestedDocType(req) {
  const requested = normalizeDocType(req.body.doc_type || 'hvi');
  if (requested === 'hvi') {
    const filename = req.file?.originalname || '';
    if (looksLikeApctFilename(filename)) return 'apct';
    if (looksLikeNoilsFilename(filename)) return 'noils';
    if (looksLikeStrechFilename(filename)) return 'strech';
  }
  return requested;
}

function withTimeout(signalMs = OCR_TIMEOUT_MS) {
  return AbortSignal.timeout(Math.max(1, signalMs));
}

function sendSse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function ensureHviTable() {
  if (hviTableReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS hvi_records (
      id SERIAL PRIMARY KEY,
      doc_type TEXT DEFAULT 'hvi',
      filename TEXT,
      ocr_json JSONB,
      manual_json JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await db.query(`
    ALTER TABLE hvi_records
      ADD COLUMN IF NOT EXISTS doc_type TEXT DEFAULT 'hvi';
  `);
  hviTableReady = true;
}

async function ensureMachineOcrTable() {
  if (machineTableReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS ocr_machine_records (
      id SERIAL PRIMARY KEY,
      machine_type TEXT NOT NULL,
      filename TEXT,
      machine_name TEXT,
      ocr_json JSONB,
      manual_json JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await db.query(`
    ALTER TABLE ocr_machine_records
      ADD COLUMN IF NOT EXISTS machine_type TEXT NOT NULL DEFAULT 'drawing',
      ADD COLUMN IF NOT EXISTS filename TEXT,
      ADD COLUMN IF NOT EXISTS machine_name TEXT,
      ADD COLUMN IF NOT EXISTS ocr_json JSONB,
      ADD COLUMN IF NOT EXISTS manual_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
  `);
  machineTableReady = true;
}

function parseFinalJson(stdout = '') {
  const lines = stdout.trim().split(/\r?\n/).reverse();
  for (const line of lines) {
    const candidate = line.trim();
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch (_) {
      // Keep scanning; OCR script logs may be mixed with JSON output.
    }
  }
  throw new Error('OCR local pipeline did not emit valid JSON output.');
}

function firstArray(value) {
  return Array.isArray(value) ? value : null;
}

function getRowsFromOcrPayload(payload = {}) {
  const result = payload.result || payload;
  return (
    firstArray(result.raw_tables) ||
    firstArray(result.extracted_tables) ||
    firstArray(result.data) ||
    firstArray(result.json_output) ||
    []
  );
}

function hasOcrRows(payload = {}) {
  return getRowsFromOcrPayload(payload).length > 0;
}

function buildOcrNoRowsMessage(result = {}, docType = 'hvi') {
  const rawText = String(result.raw_text || '').trim();
  const extractedCount = getRowsFromOcrPayload(result).length;
  const fieldsCount = Array.isArray(result.fields) ? result.fields.length : 0;
  const detectedDocType = String(result.doc_type || docType || 'hvi').trim() || 'hvi';

  if (!rawText) {
    return `OCR returned no readable text for ${detectedDocType.toUpperCase()}. Check image quality, file format, or OCR runtime support.`;
  }

  return `OCR found text for ${detectedDocType.toUpperCase()} but no rows were extracted. Check the report layout, header visibility, or whether the document type is correct. raw_text_chars=${rawText.length}, extracted_rows=${extractedCount}, fields=${fieldsCount}`;
}

function getPythonLaunchers() {
  const launchers = [];
  if (OCR_PYTHON) {
    launchers.push({ command: OCR_PYTHON, baseArgs: [] });
  }
  if (process.env.LOCALAPPDATA) {
    launchers.push({
      command: path.join(process.env.LOCALAPPDATA, 'Programs', 'Python', 'Python311', 'python.exe'),
      baseArgs: [],
    });
  }
  launchers.push({ command: 'python', baseArgs: [] });
  // Windows launcher fallback when "python" is unavailable in PATH.
  launchers.push({ command: 'py', baseArgs: ['-3'] });
  const seen = new Set();
  return launchers.filter((launcher) => {
    const key = [launcher.command, ...launcher.baseArgs].join('\0');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isMissingPythonDependency(output = '') {
  return (
    output.includes('ModuleNotFoundError') ||
    output.includes('ImportError')
  ) && (
    output.includes("No module named 'cv2'") ||
    output.includes('No module named "cv2"') ||
    output.includes("No module named 'rapidocr_onnxruntime'") ||
    output.includes('No module named "rapidocr_onnxruntime"') ||
    output.includes("No module named 'numpy'") ||
    output.includes('No module named "numpy"') ||
    output.includes("No module named 'PIL'") ||
    output.includes('No module named "PIL"')
  );
}

function isUnusablePythonLauncher(output = '') {
  return (
    output.includes('No pyvenv.cfg file') ||
    output.includes('Fatal Python error') ||
    output.includes('Unable to create process using')
  );
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toTextOrDefault(value, fallback) {
  const s = String(value || '').trim();
  return s || fallback;
}

async function saveBwcToCarding(payload) {
  const rows = Array.isArray(payload.manual_json) ? payload.manual_json : [];
  const row = rows[0] || {};

  const sampleWeights = Array.from({ length: BWC_ENTRY_COUNT }, (_, i) => i + 1)
    .map((i) => toNumberOrNull(row[`Sample Weight ${i}`]))
    .filter((v) => v !== null);
  const hanks = Array.from({ length: BWC_ENTRY_COUNT }, (_, i) => i + 1)
    .map((i) => toNumberOrNull(row[`Hank ${i}`]))
    .filter((v) => v !== null);

  if (sampleWeights.length === 0 || hanks.length === 0) {
    throw new Error('BWC save needs at least one Sample Weight and one Hank value.');
  }

  const count = Math.min(sampleWeights.length, hanks.length);
  const trimmedSampleWeights = sampleWeights.slice(0, count);
  const trimmedHanks = hanks.slice(0, count);
  const inspectionId = `BW-${Date.now()}`;
  const typeCategory = toTextOrDefault(payload.type_category, 'Between & Within Card Data Entry');
  const inspectionType = toTextOrDefault(payload.inspection_type, 'Within');
  const mcName = toTextOrDefault(payload.mc_name, 'OCR');
  const inspectionDate = toTextOrDefault(payload.inspection_date, new Date().toISOString().slice(0, 10));

  await db.query('BEGIN');
  try {
    await db.query(
      `INSERT INTO carding.inspections
        (id, type_category, inspection_type, mc_name, inspection_date, num_entries)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [inspectionId, typeCategory, inspectionType, mcName, inspectionDate, count]
    );

    for (let i = 0; i < count; i += 1) {
      await db.query(
        `INSERT INTO carding.sample_weights (inspection_id, entry_no, value)
         VALUES ($1, $2, $3)`,
        [inspectionId, i + 1, trimmedSampleWeights[i]]
      );
      await db.query(
        `INSERT INTO carding.hanks (inspection_id, entry_no, value)
         VALUES ($1, $2, $3)`,
        [inspectionId, i + 1, trimmedHanks[i]]
      );
    }

    await db.query('COMMIT');
    return inspectionId;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

function runLocalOcr(filePath, docType) {
  return new Promise((resolve, reject) => {
    const launchers = getPythonLaunchers();
    const tried = [];
    let index = 0;

    const attempt = () => {
      if (index >= launchers.length) {
        const triedText = tried.join(', ') || 'no launchers';
        reject(new Error(`No usable Python launcher found. Tried: ${triedText}`));
        return;
      }

      const launcher = launchers[index++];
      const args = [...launcher.baseArgs, OCR_SCRIPT, filePath, docType];
      const proc = spawn(launcher.command, args, {
        cwd: path.join(__dirname, '..'),
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      let done = false;

      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        proc.kill('SIGTERM');
        reject(new Error(`Local OCR timed out after ${OCR_LOCAL_TIMEOUT_MS}ms`));
      }, OCR_LOCAL_TIMEOUT_MS);

      proc.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      proc.on('error', () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        tried.push([launcher.command, ...launcher.baseArgs].join(' '));
        attempt();
      });

      proc.on('close', (code) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (code !== 0) {
          const output = `${stderr || stdout}`.trim();
          const launcherName = [launcher.command, ...launcher.baseArgs].join(' ');
          tried.push(`${launcherName} exited with code ${code}`);
          if ((isUnusablePythonLauncher(output) || isMissingPythonDependency(output)) && index < launchers.length) {
            attempt();
            return;
          }
          reject(new Error(`Local OCR exited with code ${code} using ${launcherName}. ${output}`.trim()));
          return;
        }
        try {
          resolve(parseFinalJson(stdout));
        } catch (error) {
          const details = `${error.message} ${stderr}`.trim();
          reject(new Error(details));
        }
      });
    };

    attempt();
  });
}

router.get('/api/fields', async (req, res) => {
  const docType = normalizeDocType(req.query.doc_type || 'hvi');
  return res.status(200).json({
    fields: getFieldNames(docType),
    source: 'local',
  });
});

router.post('/api/ocr-json', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ detail: 'File is required' });

  const docType = getRequestedDocType(req);

  if (docType === 'apct') {
    const tempPath = path.join(
      os.tmpdir(),
      `ocr-upload-${Date.now()}-${Math.random().toString(16).slice(2)}-${req.file.originalname || 'upload'}`
    );

    try {
      await fs.writeFile(tempPath, req.file.buffer);
      const result = await runLocalOcr(tempPath, docType);
      if (!hasOcrRows(result) && !String(result.raw_text || '').trim()) {
        return res.status(422).json({ detail: buildOcrNoRowsMessage(result, docType) });
      }
      return res.status(200).json({
        success: true,
        filename: result.filename,
        doc_type: result.doc_type || 'apct',
        data: result.json_output || [],
        raw_tables: result.extracted_tables || [],
        fields: result.fields || APCT_FIELDS,
        raw_text: result.raw_text || '',
      });
    } catch (error) {
      return res.status(503).json({ detail: `A% OCR failed: ${error.message}` });
    } finally {
      await fs.unlink(tempPath).catch(() => {});
    }
  }

  const tempPath = path.join(
    os.tmpdir(),
    `ocr-upload-${Date.now()}-${Math.random().toString(16).slice(2)}-${req.file.originalname || 'upload'}`
  );

  try {
    await fs.writeFile(tempPath, req.file.buffer);
    const result = await runLocalOcr(tempPath, docType);
    if (!hasOcrRows(result) && !String(result.raw_text || '').trim()) {
      return res.status(422).json({ detail: buildOcrNoRowsMessage(result, docType) });
    }
    return res.status(200).json({
      success: true,
      filename: result.filename,
      doc_type: result.doc_type || docType,
      data: result.json_output || [],
      raw_tables: result.extracted_tables || [],
      fields: result.fields || getFieldNames(result.doc_type || docType),
      raw_text: result.raw_text || '',
    });
  } catch (error) {
    return res.status(503).json({ detail: `OCR failed: ${error.message}` });
  } finally {
    await fs.unlink(tempPath).catch(() => {});
  }
});

router.post('/api/ocr', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File is required' });

  const docType = getRequestedDocType(req);

  if (docType === 'apct') {
    const tempPath = path.join(
      os.tmpdir(),
      `ocr-upload-${Date.now()}-${Math.random().toString(16).slice(2)}-${req.file.originalname || 'upload'}`
    );

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      sendSse(res, {
        step: 1,
        msg: `A% PDF/image received: ${req.file.originalname || 'upload'}`,
      });
      await fs.writeFile(tempPath, req.file.buffer);
      sendSse(res, { step: 2, msg: 'Running A% OCR parser...' });
      const result = await runLocalOcr(tempPath, docType);
      sendSse(res, {
        step: 3,
        msg: `Parsed ${Array.isArray(result.json_output) ? result.json_output.length : 0} A% row(s).`,
      });
      sendSse(res, { step: 99, msg: 'Done', result });
    } catch (error) {
      sendSse(res, {
        step: -1,
        msg: `A% OCR failed: ${error.message}`,
        error: true,
      });
    } finally {
      await fs.unlink(tempPath).catch(() => {});
      res.end();
    }
    return;
  }

  if (MACHINE_DOC_TYPES.has(docType)) {
    const tempPath = path.join(
      os.tmpdir(),
      `ocr-upload-${Date.now()}-${Math.random().toString(16).slice(2)}-${req.file.originalname || 'upload'}`
    );

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      sendSse(res, { step: 1, msg: 'File received. Running machine OCR...' });
      await fs.writeFile(tempPath, req.file.buffer);
      sendSse(res, { step: 2, msg: 'Extracting table values...' });
      const result = await runLocalOcr(tempPath, docType);
      if (!hasOcrRows(result) && !String(result.raw_text || '').trim()) {
        sendSse(res, {
          step: -1,
          msg: buildOcrNoRowsMessage(result, docType),
          error: true,
        });
        return;
      }
      sendSse(res, { step: 99, msg: 'Done', result });
    } catch (error) {
      sendSse(res, {
        step: -1,
        msg: `Machine OCR failed: ${error.message}`,
        error: true,
      });
    } finally {
      await fs.unlink(tempPath).catch(() => {});
      res.end();
    }
    return;
  }
  const tempPath = path.join(
    os.tmpdir(),
    `ocr-upload-${Date.now()}-${Math.random().toString(16).slice(2)}-${req.file.originalname || 'upload'}`
  );

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    sendSse(res, { step: 1, msg: 'File received. Running local OCR pipeline...' });
    await fs.writeFile(tempPath, req.file.buffer);
    sendSse(res, { step: 2, msg: 'Extracting table values...' });
    const result = await runLocalOcr(tempPath, docType);
    if (!hasOcrRows(result) && !String(result.raw_text || '').trim()) {
      sendSse(res, {
        step: -1,
        msg: buildOcrNoRowsMessage(result, docType),
        error: true,
      });
      return;
    }
    sendSse(res, { step: 99, msg: 'Done', result });
  } catch (error) {
    sendSse(res, {
      step: -1,
      msg: `OCR failed in local pipeline: ${error.message}`,
      error: true,
    });
  } finally {
    await fs.unlink(tempPath).catch(() => {});
    res.end();
  }
});

router.post('/api/save', express.json({ limit: '10mb' }), async (req, res) => {
  const payload = req.body || {};
  const docType = normalizeDocType(payload.doc_type);

  if (MACHINE_DOC_TYPES.has(docType)) {
    try {
      if (!Array.isArray(payload.manual_json) || payload.manual_json.length === 0) {
        return res.status(400).json({ detail: 'No fields to save.' });
      }

      await ensureMachineOcrTable();
      const inserted = await db.query(
        `
          INSERT INTO ocr_machine_records (machine_type, filename, machine_name, ocr_json, manual_json)
          VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
          RETURNING id
        `,
        [
          docType,
          String(payload.filename || ''),
          String(payload.mc_name || '').trim(),
          JSON.stringify(Array.isArray(payload.ocr_json) ? payload.ocr_json : []),
          JSON.stringify(payload.manual_json),
        ]
      );

      return res.status(200).json({
        id: inserted.rows[0].id,
        status: 'saved',
        source: 'local-machine',
      });
    } catch (error) {
      return res.status(500).json({ detail: `Machine OCR save failed: ${error.message}` });
    }
  }

  try {
    const payload = req.body || {};
    if (!Array.isArray(payload.manual_json) || payload.manual_json.length === 0) {
      return res.status(400).json({ detail: 'No fields to save.' });
    }

    const filename = (payload.filename || '').toString();
    const ocrJson = Array.isArray(payload.ocr_json) ? payload.ocr_json : [];
    const manualJson = payload.manual_json;
    const docType = normalizeDocType(payload.doc_type || 'hvi');

    if (docType === 'bwc') {
      const inspectionId = await saveBwcToCarding(payload);
      return res.status(200).json({
        id: inspectionId,
        status: 'saved',
        source: 'local',
      });
    }

    if (MACHINE_DOC_TYPES.has(docType)) {
      await ensureMachineOcrTable();
      const inserted = await db.query(
        `
          INSERT INTO ocr_machine_records (machine_type, filename, machine_name, ocr_json, manual_json)
          VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
          RETURNING id
        `,
        [
          docType,
          filename,
          String(payload.mc_name || '').trim(),
          JSON.stringify(ocrJson),
          JSON.stringify(manualJson),
        ]
      );

      return res.status(200).json({
        id: inserted.rows[0].id,
        status: 'saved',
        source: 'local',
      });
    }

    await ensureHviTable();
    const inserted = await db.query(
      `
        INSERT INTO hvi_records (doc_type, filename, ocr_json, manual_json)
        VALUES ($1, $2, $3::jsonb, $4::jsonb)
        RETURNING id
      `,
      [docType, filename, JSON.stringify(ocrJson), JSON.stringify(manualJson)]
    );

    return res.status(200).json({
      id: inserted.rows[0].id,
      status: 'saved',
      source: 'local',
    });
  } catch (fallbackError) {
    return res.status(503).json({
      detail: `OCR save failed: ${fallbackError.message}`,
    });
  }
});

module.exports = router;
