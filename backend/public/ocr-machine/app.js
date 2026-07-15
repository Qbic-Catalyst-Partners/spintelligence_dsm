/**
 * app.js — HVI OCR frontend logic
 *
 * Flow:
 *  1. User selects file → preview shown
 *  2. "Run OCR" → POST /api/ocr via EventSource (SSE)
 *  3. Each SSE event updates progress panel in real-time
 *  4. Final event (step 99) populates: raw text, extracted table, JSON, form
 *  5. User edits form → "Save Record" → POST /api/save
 */

'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
let state = {
  file: null,
  ocrResult: null,
  fieldNames: [],
  effectiveDocType: null,
  savedId: null,
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const docTypeSelect   = $('docTypeSelect');
const fileInput       = $('fileInput');
const uploadArea      = $('uploadArea');
const uploadPlaceholder = $('uploadPlaceholder');
const uploadPreview   = $('uploadPreview');
const browseBtn       = $('browseBtn');
const previewIcon     = document.querySelector('.preview-icon');
const previewName     = $('previewName');
const previewSize     = $('previewSize');
const runOcrBtn       = $('runOcrBtn');
const clearFileBtn    = $('clearFileBtn');

const sectionProgress = $('sectionProgress');
const progressSteps   = $('progressSteps');
const logPanel        = $('logPanel');
const progressSpinner = $('progressSpinner');

const sectionResults  = $('sectionResults');
const rawOcrText      = $('rawOcrText');
const ocrRegionCount  = $('ocrRegionCount');
const tableWrapper    = $('tableWrapper');
const tableBadge      = $('tableBadge');
const jsonOutput      = $('jsonOutput');
const copyJsonBtn     = $('copyJsonBtn');

const sectionForm     = $('sectionForm');
const metaGrid        = $('metaGrid');
const formGrid        = $('formGrid');
const machineNameInput = $('machineNameInput');
const inspectionTypeInput = $('inspectionTypeInput');
const inspectionDateInput = $('inspectionDateInput');
const testIdInput     = $('testIdInput');
const useAsInputBtn    = $('useAsInputBtn');
const formAlert       = $('formAlert');
const hviForm         = $('hviForm');
const saveBtn         = $('saveBtn');
const clearFormBtn    = $('clearFormBtn');
const newEntryBtn     = $('newEntryBtn');
const saveSuccess     = $('saveSuccess');
const saveError       = $('saveError');
const saveRecordId    = $('saveRecordId');
const saveErrorMsg    = $('saveErrorMsg');
const inputIdBadge    = $('inputIdBadge');
let isSaving = false;

const DEFAULT_FILE_ACCEPT = '.jpg,.jpeg,.png,.pdf';
const APCT_FILE_ACCEPT = '.jpg,.jpeg,.png,.pdf,.xlsx';
const DEFAULT_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const APCT_ALLOWED_TYPES = [
  ...DEFAULT_ALLOWED_TYPES,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const EXCEL_FILE_EXTENSIONS = ['.xlsx'];


// ── Step bar management ───────────────────────────────────────────────────────
function setStepState(stepId, stateClass) {
  const el = $(stepId);
  if (!el) return;
  el.classList.remove('active', 'done');
  if (stateClass) el.classList.add(stateClass);
}
function setLineState(lineId, done) {
  const el = $(lineId);
  if (!el) return;
  el.classList.toggle('done', done);
}

// ── Progress helpers ──────────────────────────────────────────────────────────
const STEP_LABELS = {
  1: 'File received',
  2: 'OCR engine ready',
  3: 'OCR inference',
  4: 'Raw text',
  5: 'Header detection',
  6: 'Row selection',
  7: 'Field mapping',
  8: 'JSON output',
  9: 'Complete',
};

function addProgressStep(step, msg, type = 'done') {
  const div = document.createElement('div');
  div.className = `progress-step ${type}`;
  const icon = type === 'done' ? '✅' : type === 'error' ? '❌' : '⏳';
  div.innerHTML = `<span class="progress-step-icon">${icon}</span><span>${msg}</span>`;
  progressSteps.appendChild(div);
  progressSteps.scrollTop = progressSteps.scrollHeight;
}

function addLog(msg) {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
  logPanel.textContent += `[${ts}] ${msg}\n`;
  logPanel.scrollTop = logPanel.scrollHeight;
}

// ── Upload handling ───────────────────────────────────────────────────────────
function isExcelFile(file) {
  const name = String(file.name || '').toLowerCase();
  return EXCEL_FILE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function getFilePreviewIcon(file) {
  const name = String(file.name || '').toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return '📄';
  if (isExcelFile(file)) return '📊';
  return '🖼️';
}

function updateFileAccept() {
  const isApct = docTypeSelect.value === 'apct';
  fileInput.accept = isApct ? APCT_FILE_ACCEPT : DEFAULT_FILE_ACCEPT;
  const uploadSub = document.querySelector('.upload-sub');
  if (uploadSub) {
    uploadSub.textContent = isApct
      ? 'JPG, PNG, PDF, or XLSX - max 20 MB'
      : 'JPG, PNG, or PDF - max 20 MB';
  }
}

browseBtn.addEventListener('click', () => {
  updateFileAccept();
  fileInput.click();
});
uploadPlaceholder.addEventListener('click', (e) => {
  if (e.target !== browseBtn) {
    updateFileAccept();
    fileInput.click();
  }
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

// Drag-and-drop
uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadPlaceholder.classList.add('drag-over');
});
uploadArea.addEventListener('dragleave', () => uploadPlaceholder.classList.remove('drag-over'));
uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadPlaceholder.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f) handleFile(f);
});

function handleFile(file) {
  const isApct = docTypeSelect.value === 'apct';
  const allowed = isApct ? APCT_ALLOWED_TYPES : DEFAULT_ALLOWED_TYPES;
  if (!allowed.includes(file.type) && !(isApct && isExcelFile(file))) {
    alert(isApct
      ? 'Please upload a JPG, PNG, PDF, or XLSX file.'
      : 'Please upload a JPG, PNG, or PDF file.');
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    alert('File too large (max 20 MB).');
    return;
  }
  state.file = file;
  if (previewIcon) previewIcon.textContent = getFilePreviewIcon(file);
  previewName.textContent = file.name;
  previewSize.textContent = formatBytes(file.size);
  uploadPlaceholder.classList.add('hidden');
  uploadPreview.classList.remove('hidden');

  // Reset downstream sections
  resetResults();
}

docTypeSelect.addEventListener('change', () => {
  updateFileAccept();
  // Clear the current file if user changes doc type, because it invalidates the pipeline
  state.file = null;
  fileInput.value = '';
  uploadPlaceholder.classList.remove('hidden');
  uploadPreview.classList.add('hidden');
  resetResults();
  setStepState('step-upload', 'active');
  setStepState('step-extract', '');
  setStepState('step-review', '');
  setStepState('step-save', '');
  
  // Refresh fields for the new doc type
  state.fieldNames = [];
  fetchFields();
});

clearFileBtn.addEventListener('click', () => {
  state.file = null;
  fileInput.value = '';
  uploadPlaceholder.classList.remove('hidden');
  uploadPreview.classList.add('hidden');
  resetResults();
  setStepState('step-upload', 'active');
  setStepState('step-extract', '');
  setStepState('step-review', '');
  setStepState('step-save', '');
});

function resetResults() {
  sectionProgress.classList.add('hidden');
  sectionResults.classList.add('hidden');
  sectionForm.classList.add('hidden');
  progressSteps.innerHTML = '';
  logPanel.textContent = '';
  rawOcrText.value = '';
  tableWrapper.innerHTML = '';
  jsonOutput.textContent = '';
  formGrid.innerHTML = '';
  saveSuccess.classList.add('hidden');
  saveError.classList.add('hidden');
  formAlert.style.display = 'none';
  state.ocrResult = null;
  state.effectiveDocType = null;
  state.savedId = null;
  if (metaGrid) metaGrid.classList.add('hidden');
}

function collectManualJsonFromForm() {
  const manualJson = [];
  let currentRow = -1;
  let currentObj = {};
  formGrid.querySelectorAll('input').forEach((input) => {
    const rowIdx = parseInt(input.dataset.row, 10);
    if (rowIdx !== currentRow) {
      if (currentRow !== -1) manualJson.push(currentObj);
      currentRow = rowIdx;
      currentObj = {};
    }
    if (input.name && input.value.trim()) currentObj[input.name] = input.value.trim();
  });
  if (currentRow !== -1) manualJson.push(currentObj);
  return manualJson;
}

function countBwcEntries(row = {}) {
  if (docTypeSelect.value !== 'bwc') return 0;
  let count = 0;
  for (let i = 1; i <= 100; i += 1) {
    const sampleWeight = String(row[`Sample Weight ${i}`] || '').trim();
    const hank = String(row[`Hank ${i}`] || '').trim();
    if (sampleWeight || hank) count = i;
  }
  return count;
}

function countApctSamples(rows = []) {
  return rows.filter((row) => String(row['Row Type'] || '').trim().toLowerCase() === 'sample').length;
}

function getDocTypeLabel() {
  const selected = docTypeSelect.options[docTypeSelect.selectedIndex];
  return selected?.textContent?.trim() || docTypeSelect.value.toUpperCase();
}

// ── OCR trigger ───────────────────────────────────────────────────────────────
runOcrBtn.addEventListener('click', runOCR);

async function runOCR() {
  if (!state.file) return;

  resetResults();
  sectionProgress.classList.remove('hidden');
  progressSpinner.classList.remove('hidden');
  runOcrBtn.disabled = true;

  setStepState('step-upload', 'done');
  setStepState('step-extract', 'active');
  setLineState('line-1-2', true);

  addLog(`Starting ${getDocTypeLabel()} OCR pipeline for: ${state.file.name}`);

  const formData = new FormData();
  formData.append('file', state.file);
  formData.append('doc_type', docTypeSelect.value);

  // Use fetch for SSE — EventSource doesn't support POST
  // We stream via fetch + ReadableStream
  try {
    const response = await fetch('api/ocr', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by double newlines
      const events = buffer.split('\n\n');
      buffer = events.pop(); // Keep incomplete event in buffer

      for (const event of events) {
        if (!event.trim()) continue;
        const line = event.replace(/^data:\s*/, '');
        if (!line) continue;

        try {
          const payload = JSON.parse(line);
          handleSSEEvent(payload);
        } catch (e) {
          addLog(`[parse error] ${line}`);
        }
      }
    }
  } catch (err) {
    addProgressStep(0, `Error: ${err.message}`, 'error');
    addLog(`ERROR: ${err.message}`);
    progressSpinner.classList.add('hidden');
    runOcrBtn.disabled = false;
  }
}

function handleSSEEvent(payload) {
  const { step, msg, error, result } = payload;

  if (error) {
    addProgressStep(step, msg, 'error');
    addLog(`❌ ${msg}`);
    progressSpinner.classList.add('hidden');
    runOcrBtn.disabled = false;
    return;
  }

  // Step 99 = final result
  if (step === 99) {
    progressSpinner.classList.add('hidden');
    runOcrBtn.disabled = false;
    if (result) populateResults(result);
    return;
  }

  addProgressStep(step, msg, 'done');
  addLog(`[Step ${step}] ${msg}`);
}

// ── Populate results ──────────────────────────────────────────────────────────
function populateResults(result) {
  state.ocrResult = result;
  state.effectiveDocType = result.doc_type || docTypeSelect.value;
  if (Array.isArray(result.fields) && result.fields.length > 0) {
    state.fieldNames = result.fields;
  }

  // Step indicators
  setStepState('step-extract', 'done');
  setStepState('step-review', 'active');
  setLineState('line-2-3', true);

  // 3a: Raw OCR text
  rawOcrText.value = result.raw_text || '';
  const regionCount = (result.raw_text || '').split('\n').filter(Boolean).length;
  ocrRegionCount.textContent = `${regionCount} regions`;

  // 3b: Extracted table
  buildTable(result.json_output || {}, result.fields || []);

  // 3c: JSON output
  jsonOutput.textContent = JSON.stringify(result.json_output || {}, null, 2);

  // Show results section
  sectionResults.classList.remove('hidden');

  // 3d: Build form
  buildForm(result.json_output || {});
  sectionForm.classList.remove('hidden');

  if (state.effectiveDocType === 'bwc') {
    metaGrid.classList.remove('hidden');
    const meta = result.metadata || {};
    if (inspectionTypeInput) inspectionTypeInput.value = meta.inspection_type || (String(result.raw_text || '').toLowerCase().includes('between') ? 'Between' : 'Within');
    if (inspectionDateInput) inspectionDateInput.value = meta.inspection_date || '';
    if (testIdInput) testIdInput.value = meta.test_id || '';
  } else {
    metaGrid.classList.add('hidden');
  }

  // Scroll to results
  setTimeout(() => sectionResults.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
}

// ── Table builder ─────────────────────────────────────────────────────────────
function buildTable(jsonOutputArray, preferredFields = []) {
  if (!Array.isArray(jsonOutputArray)) jsonOutputArray = [jsonOutputArray];

  const rowKeys = jsonOutputArray.flatMap(row => Object.keys(row || {}));
  if (jsonOutputArray.length === 0 || rowKeys.length === 0) {
    const docLabel = (state.effectiveDocType || docTypeSelect.value || 'ocr').toUpperCase();
    tableWrapper.innerHTML = `<p style="color:#94a3b8;font-size:0.85rem;padding:0.5rem 0">No rows were extracted for ${docLabel}. Check the report quality, header visibility, or document type.</p>`;
    tableBadge.textContent = '0 fields';
    return;
  }

  const preferred = Array.isArray(preferredFields) ? preferredFields : [];
  const fields = [
    ...preferred.filter(field => rowKeys.includes(field)),
    ...rowKeys.filter((field, index) => rowKeys.indexOf(field) === index && !preferred.includes(field)),
  ].filter(f => !f.startsWith('_'));
  tableBadge.textContent = `${jsonOutputArray.length} rows`;
  tableBadge.className = 'badge badge-green';

  const table = document.createElement('table');
  table.className = 'hvi-table';

  // Header row
  const thead = table.createTHead();
  const headerRow = thead.insertRow();
  fields.forEach(f => {
    const th = document.createElement('th');
    th.textContent = f;
    headerRow.appendChild(th);
  });

  // Value rows
  const tbody = table.createTBody();
  jsonOutputArray.forEach(rowJson => {
    const valueRow = tbody.insertRow();
    fields.forEach(f => {
      const td = valueRow.insertCell();
      const val = cleanDisplayValue(rowJson[f]);
      if (val !== '') {
        td.textContent = val;
      } else {
        td.textContent = '';
        td.className = 'missing';
      }
    });
  });

  tableWrapper.innerHTML = '';
  tableWrapper.appendChild(table);
}

// ── Form builder ──────────────────────────────────────────────────────────────
function buildForm(jsonOutputArray) {
  if (!Array.isArray(jsonOutputArray)) jsonOutputArray = [jsonOutputArray];

  if (state.fieldNames.length === 0) {
    fetch(`api/fields?doc_type=${docTypeSelect.value}`)
      .then(r => r.json())
      .then(({ fields }) => {
        state.fieldNames = fields;
        renderFormFields(jsonOutputArray);
      })
      .catch(() => {
        state.fieldNames = Object.keys(jsonOutputArray[0] || {});
        renderFormFields(jsonOutputArray);
      });
  } else {
    renderFormFields(jsonOutputArray);
  }
}

function renderFormFields(jsonOutputArray) {
  formGrid.innerHTML = '';
  let missingCount = 0;

  const allFields = state.fieldNames.length > 0
    ? state.fieldNames
    : Object.keys(jsonOutputArray[0] || {}).filter(name => !name.startsWith('_'));

  jsonOutputArray.forEach((rowJson, rowIndex) => {
    const rowTitle = document.createElement('div');
    rowTitle.className = 'form-row-title';
    rowTitle.textContent = (state.effectiveDocType || docTypeSelect.value) === 'apct'
      ? (rowJson['Row Type'] ? `${rowJson['Row Type']} Row ${rowIndex + 1}` : `A% Row ${rowIndex + 1}`)
      : `Data Row ${rowIndex + 1}`;
    rowTitle.style.gridColumn = '1 / -1';
    rowTitle.style.fontWeight = '700';
    rowTitle.style.color = '#1e4d9e';
    rowTitle.style.marginTop = rowIndex > 0 ? '1.5rem' : '0.5rem';
    rowTitle.style.borderBottom = '2px solid #e2e8f0';
    rowTitle.style.paddingBottom = '0.4rem';
    formGrid.appendChild(rowTitle);

    allFields.forEach(name => {
      const val = cleanDisplayValue(rowJson[name]);
      const isFilled = val !== '';
      if (!isFilled) missingCount++;

      const wrapper = document.createElement('div');
      wrapper.className = 'form-field';

      const label = document.createElement('label');
      label.setAttribute('for', `field_${rowIndex}_${name}`);
      label.textContent = name;

      const input = document.createElement('input');
      input.type = 'text';
      input.id = `field_${rowIndex}_${name}`;
      input.name = name;
      input.dataset.row = rowIndex;
      input.value = val;
      input.placeholder = `Enter ${name}`;
      input.className = isFilled ? 'ocr-filled' : 'ocr-missing';

      wrapper.appendChild(label);
      wrapper.appendChild(input);
      formGrid.appendChild(wrapper);
    });
  });

  if (missingCount > 0) {
    formAlert.style.display = 'block';
    formAlert.textContent = `⚠️ ${missingCount} field(s) could not be extracted — please fill them in manually.`;
  } else {
    formAlert.style.display = 'none';
  }

  saveBtn.disabled = (state.effectiveDocType || docTypeSelect.value) === 'bwc';
}

// ── Save ──────────────────────────────────────────────────────────────────────
hviForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (isSaving) return;
  await saveRecord();
});

async function saveRecord() {
  isSaving = true;
  saveBtn.disabled = true;
  saveSuccess.classList.add('hidden');
  saveError.classList.add('hidden');

  const manualJson = collectManualJsonFromForm();

  if (manualJson.length === 0 || manualJson.every(row => Object.keys(row).length === 0)) {
    saveErrorMsg.textContent = 'All fields are empty — nothing to save.';
    saveError.classList.remove('hidden');
    saveBtn.disabled = false;
    return;
  }

  const payload = {
    filename: state.file?.name || '',
    ocr_json: state.ocrResult?.json_output || {},
    manual_json: manualJson,
    doc_type: state.effectiveDocType || docTypeSelect.value,
    mc_name: machineNameInput?.value?.trim() || '',
    inspection_type: inspectionTypeInput?.value?.trim() || 'Within',
    inspection_date: inspectionDateInput?.value?.trim() || '',
    test_id: testIdInput?.value?.trim() || '',
    type_category: 'Between & Within Card Data Entry',
  };

  try {
    const resp = await fetch('api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.detail || `Server error ${resp.status}`);
    }

    const data = await resp.json();
    state.savedId = data.id;
    saveRecordId.textContent = `Record ID: #${data.id}`;
    saveSuccess.classList.remove('hidden');
    saveBtn.disabled = true;

    setStepState('step-review', 'done');
    setStepState('step-save', 'done');
    setLineState('line-3-4', true);

    alert(`Data submitted successfully. Record ID: #${data.id}`);
    clearFormBtn.click();
    saveSuccess.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    saveErrorMsg.textContent = `Save failed: ${err.message}`;
    saveError.classList.remove('hidden');
    saveBtn.disabled = false;
    isSaving = false;
  }
  isSaving = false;
}

// ── Form controls ─────────────────────────────────────────────────────────────
clearFormBtn.addEventListener('click', () => {
  formGrid.querySelectorAll('input').forEach(i => {
    i.value = '';
    i.className = 'ocr-missing';
  });
  saveSuccess.classList.add('hidden');
  saveError.classList.add('hidden');
  saveBtn.disabled = false;
});

newEntryBtn.addEventListener('click', () => {
  // Full reset
  state = { file: null, ocrResult: null, fieldNames: state.fieldNames, effectiveDocType: null, savedId: null };
  fileInput.value = '';
  uploadPlaceholder.classList.remove('hidden');
  uploadPreview.classList.add('hidden');
  resetResults();
  ['step-upload','step-extract','step-review','step-save'].forEach(id => setStepState(id, ''));
  setStepState('step-upload', 'active');
  ['line-1-2','line-2-3','line-3-4'].forEach(id => setLineState(id, false));
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ── JSON copy ─────────────────────────────────────────────────────────────────
copyJsonBtn.addEventListener('click', () => {
  const text = jsonOutput.textContent;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    copyJsonBtn.textContent = 'Copied!';
    setTimeout(() => { copyJsonBtn.textContent = 'Copy'; }, 2000);
  });
});

// ── Utilities ─────────────────────────────────────────────────────────────────
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function cleanDisplayValue(value) {
  const text = String(value ?? '').trim();
  return /^[-–—−]+$|^â€”$|^â€“$/.test(text) ? '' : text;
}

// ── Init ──────────────────────────────────────────────────────────────────────
function fetchFields() {
  fetch(`api/fields?doc_type=${docTypeSelect.value}`)
    .then(r => r.json())
    .then(({ fields }) => { state.fieldNames = fields; })
    .catch(() => {});
}

// Pre-fetch field names on page load
updateFileAccept();
fetchFields();

useAsInputBtn?.addEventListener('click', () => {
  prepareInputPayloadForChild().catch((err) => {
    saveErrorMsg.textContent = `Could not prepare input payload: ${err.message}`;
    saveError.classList.remove('hidden');
  });
});

async function prepareInputPayloadForChild() {
  const manualJson = collectManualJsonFromForm();
  const inspectionDate = (inspectionDateInput?.value || '').trim();
  const effectiveDocType = state.effectiveDocType || docTypeSelect.value;
  const isApct = effectiveDocType === 'apct';
  const payload = {
    doc_type: effectiveDocType,
    screen_name: isApct ? 'A%' : getDocTypeLabel(),
    mc_name: machineNameInput?.value?.trim() || '',
    inspection_type: inspectionTypeInput?.value?.trim() || 'Within',
    inspection_date: inspectionDate,
    test_id: testIdInput?.value?.trim() || '',
    type_category: isApct ? 'A%' : 'Between & Within Card Data Entry',
    num_entries: isApct ? countApctSamples(manualJson) : countBwcEntries(manualJson[0] || {}),
    values: manualJson,
    filename: state.file?.name || '',
  };
  localStorage.setItem('ocr_input_payload', JSON.stringify(payload));
  window.dispatchEvent(new CustomEvent('ocr:use-as-input', { detail: payload }));
  saveSuccess.classList.remove('hidden');
  saveRecordId.textContent = 'Prepared input payload for the input screen.';
}
