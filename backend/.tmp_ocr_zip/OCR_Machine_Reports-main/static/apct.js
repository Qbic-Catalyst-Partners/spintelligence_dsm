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
    const resp = await fetch('/api/ocr-json', {
      method: 'POST',
      body: formData,
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.detail || `Server error ${resp.status}`);
    }

    const data = await resp.json();
    const rows = data.raw_tables || [];
    populateFields(rows);
    resultsCard.style.display = 'block';
    statusText.textContent = 'Extraction complete.';
  } catch (err) {
    statusText.textContent = `Error: ${err.message}`;
  } finally {
    runOcrBtn.disabled = false;
  }
});

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
      meta.totalTest = row['Total Test'] || '';
      meta.numberEntries = row['Number of Entries (N)'] || '';
      meta.standardApct = row['Standard A%'] || '';
      meta.apctNMinus1 = row['A% (N-1)'] || '';
      meta.apctNPlus1 = row['A% (N+1)'] || '';
      return;
    }

    if (rowType === 'sample') {
      samples.push({
        sampleNo: row['Sample No'] || '',
        nMinus1: row['N-1'] || '',
        n: row['N'] || '',
        nPlus1: row['N+1'] || '',
      });
      return;
    }

    if (rowType === 'summary') {
      summary.push({
        label: row['Label'] || '',
        nMinus1: row['N-1'] || '',
        n: row['N'] || '',
        nPlus1: row['N+1'] || '',
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

    tdNo.innerHTML = `<input type="text" value="${sample.sampleNo || (idx + 1)}" />`;
    tdNMinus1.innerHTML = `<input type="text" value="${sample.nMinus1}" />`;
    tdN.innerHTML = `<input type="text" value="${sample.n}" />`;
    tdNPlus1.innerHTML = `<input type="text" value="${sample.nPlus1}" />`;

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
    <div class="summary-label">Average Weight</div>
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
    label.textContent = row.label || '—';

    const nMinus1 = document.createElement('input');
    nMinus1.type = 'text';
    nMinus1.value = row.nMinus1 || '';

    const n = document.createElement('input');
    n.type = 'text';
    n.value = row.n || '';

    const nPlus1 = document.createElement('input');
    nPlus1.type = 'text';
    nPlus1.value = row.nPlus1 || '';

    wrapper.appendChild(label);
    wrapper.appendChild(nMinus1);
    wrapper.appendChild(n);
    wrapper.appendChild(nPlus1);

    summaryContainer.appendChild(wrapper);
  });
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
