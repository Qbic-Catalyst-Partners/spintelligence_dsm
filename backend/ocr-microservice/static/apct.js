'use strict';

let state = {
  file: null,
};

const $ = (id) => document.getElementById(id);

const fileInput = $('fileInput');
const browseBtn = $('browseBtn');
const runOcrBtn = $('runOcrBtn');
const statusText = $('statusText');
const resultsCard = $('resultsCard');

const totalTest = $('totalTest');
const numberEntries = $('numberEntries');
const standardApct = $('standardApct');
const apctNMinus1 = $('apctNMinus1');
const apctNPlus1 = $('apctNPlus1');
const sampleTableBody = $('sampleTableBody');
const summaryContainer = $('summaryContainer');

const API_BASE = resolveApiBase();

browseBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) {
    state.file = fileInput.files[0];
    statusText.textContent = `${state.file.name} (${formatBytes(state.file.size)})`;
    runOcrBtn.disabled = false;
  }
});

runOcrBtn.addEventListener('click', async () => {
  if (!state.file) return;
  runOcrBtn.disabled = true;
  statusText.textContent = 'Running OCR...';

  const formData = new FormData();
  formData.append('file', state.file);
  formData.append('doc_type', 'apct');

  try {
    const result = await runApctOcr(formData);
    const rows = result.json_output || result.data || result.extracted_tables || result.raw_tables || [];
    populateFields(rows);
    resultsCard.style.display = 'block';
    statusText.textContent = 'Extraction complete.';
  } catch (err) {
    statusText.textContent = `Error: ${err.message}`;
  } finally {
    runOcrBtn.disabled = false;
  }
});

function resolveApiBase() {
  if (window.OCR_API_BASE) return String(window.OCR_API_BASE).replace(/\/$/, '');
  if (window.location.protocol === 'file:') return 'http://localhost:4000/ocr-machine';
  if (window.location.port === '8000') return window.location.origin;
  return `${window.location.origin}/ocr-machine`;
}

async function runApctOcr(formData) {
  const resp = await fetch(`${API_BASE}/api/ocr`, {
    method: 'POST',
    body: formData,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text || `Server error ${resp.status}`);
  }

  const contentType = resp.headers.get('content-type') || '';
  if (!contentType.includes('text/event-stream')) {
    return resp.json();
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split('\n\n');
    buffer = events.pop();

    for (const event of events) {
      const dataLine = event
        .split(/\r?\n/)
        .find((line) => line.startsWith('data:'));
      if (!dataLine) continue;

      const payload = JSON.parse(dataLine.replace(/^data:\s*/, ''));
      if (payload.error) throw new Error(payload.msg || 'OCR failed.');
      if (payload.step === 99) finalResult = payload.result;
      else if (payload.msg) statusText.textContent = payload.msg;
    }
  }

  if (!finalResult) throw new Error('OCR completed without a final result.');
  return finalResult;
}

function populateFields(rows) {
  const parsed = parseApctRows(rows);
  const total = parsed.meta.totalTest || parsed.samples.length.toString();
  totalTest.value = total || '';
  numberEntries.value = parsed.meta.numberEntries || total || '';
  standardApct.value = parsed.meta.standardApct || '';
  apctNMinus1.value = parsed.meta.apctNMinus1 || '';
  apctNPlus1.value = parsed.meta.apctNPlus1 || '';

  renderSamples(parsed.samples);
  renderSummary(parsed.summary);
}

function parseApctRows(rows) {
  const samples = [];
  const summary = [];
  const meta = {
    totalTest: '',
    numberEntries: '',
    standardApct: '',
    apctNMinus1: '',
    apctNPlus1: '',
  };

  rows.forEach((row) => {
    const rowType = (row['Row Type'] || '').trim().toLowerCase();
    if (!rowType) return;

    if (rowType === 'meta') {
      meta.totalTest = cleanDisplayValue(row['Total Test']);
      meta.numberEntries = cleanDisplayValue(row['Number of Entries (N)']);
      meta.standardApct = cleanDisplayValue(row['Standard A%']);
      meta.apctNMinus1 = cleanDisplayValue(row['A% (N-1)']);
      meta.apctNPlus1 = cleanDisplayValue(row['A% (N+1)']);
      return;
    }

    if (rowType === 'sample') {
      samples.push({
        sampleNo: cleanDisplayValue(row['Sample No']),
        nMinus1: cleanDisplayValue(row['N-1']),
        n: cleanDisplayValue(row.N),
        nPlus1: cleanDisplayValue(row['N+1']),
      });
      return;
    }

    if (rowType === 'summary') {
      summary.push({
        label: cleanDisplayValue(row.Label),
        nMinus1: cleanDisplayValue(row['N-1']),
        n: cleanDisplayValue(row.N),
        nPlus1: cleanDisplayValue(row['N+1']),
      });
    }
  });

  return { samples, summary, meta };
}

function renderSamples(samples) {
  sampleTableBody.innerHTML = '';

  if (samples.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="4" style="color:#94a3b8;">No sample rows detected.</td>';
    sampleTableBody.appendChild(row);
    return;
  }

  samples.forEach((sample, idx) => {
    const tr = document.createElement('tr');

    const tdNo = document.createElement('td');
    const tdNMinus1 = document.createElement('td');
    const tdN = document.createElement('td');
    const tdNPlus1 = document.createElement('td');

    tdNo.appendChild(makeInput(sample.sampleNo || String(idx + 1)));
    tdNMinus1.appendChild(makeInput(sample.nMinus1));
    tdN.appendChild(makeInput(sample.n));
    tdNPlus1.appendChild(makeInput(sample.nPlus1));

    tr.appendChild(tdNo);
    tr.appendChild(tdNMinus1);
    tr.appendChild(tdN);
    tr.appendChild(tdNPlus1);

    sampleTableBody.appendChild(tr);
  });
}

function renderSummary(summaryRows) {
  summaryContainer.innerHTML = '';

  if (summaryRows.length === 0) {
    summaryContainer.innerHTML = '<p style="color:#94a3b8;padding:0 1.5rem 1rem;">No summary rows detected.</p>';
    return;
  }

  const header = document.createElement('div');
  header.className = 'summary-grid';
  header.innerHTML = `
    <div class="summary-label">Label</div>
    <div class="summary-label">N-1</div>
    <div class="summary-label">N</div>
    <div class="summary-label">N+1</div>
  `;
  summaryContainer.appendChild(header);

  summaryRows.forEach((row) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'summary-grid';

    const label = document.createElement('div');
    label.className = 'summary-label';
    label.textContent = cleanDisplayValue(row.label);

    wrapper.appendChild(label);
    wrapper.appendChild(makeInput(row.nMinus1));
    wrapper.appendChild(makeInput(row.n));
    wrapper.appendChild(makeInput(row.nPlus1));

    summaryContainer.appendChild(wrapper);
  });
}

function makeInput(value) {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = cleanDisplayValue(value);
  return input;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function cleanDisplayValue(value) {
  const text = String(value ?? '').trim();
  return /^[-–—−]+$|^â€”$|^â€“$/.test(text) ? '' : text;
}
