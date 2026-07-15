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
const stdNoils = $('stdNoils');
const testId = $('testId');
const machineId = $('machineId');
const tester = $('tester');
const noilsPct = $('noilsPct');
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
  formData.append('doc_type', 'noils');

  try {
    const resp = await fetch(`${API_BASE}/api/ocr-json`, {
      method: 'POST',
      body: formData,
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.detail || `Server error ${resp.status}`);
    }

    const data = await resp.json();
    const rows = getRowsFromOcrResponse(data);
    if (rows.length === 0) {
      throw new Error('OCR completed but no Noils rows were returned.');
    }
    populateFields(rows, data?.result?.raw_text || data?.raw_text || '');
    resultsCard.style.display = 'block';
    statusText.textContent = 'Extraction complete.';
  } catch (err) {
    statusText.textContent = `Error: ${err.message}`;
  } finally {
    runOcrBtn.disabled = false;
  }
});

function getRowsFromOcrResponse(data) {
  const result = data?.result || data || {};
  return (
    firstArray(result.data) ||
    firstArray(result.json_output) ||
    firstArray(result.extracted_tables) ||
    firstArray(result.raw_tables) ||
    []
  );
}

function firstArray(value) {
  return Array.isArray(value) ? value : null;
}

function resolveApiBase() {
  if (window.OCR_API_BASE) return String(window.OCR_API_BASE).replace(/\/$/, '');
  if (window.location.protocol === 'file:') return 'http://localhost:4000/ocr-machine';
  return `${window.location.origin}/ocr-machine`;
}

function populateFields(rows, rawText = '') {
  const parsed = parseNoilsRows(rows);
  backfillNoilsTester(parsed.meta, rawText);
  const total = parsed.meta.totalTest || parsed.samples.length.toString();
  testId.value = parsed.meta.testId || '';
  machineId.value = parsed.meta.machineId || '';
  totalTest.value = total || '';
  numberEntries.value = parsed.meta.numberEntries || total || '';
  stdNoils.value = parsed.meta.stdNoils || '';
  tester.value = parsed.meta.tester || '';
  noilsPct.value = parsed.meta.noilsPct || '';

  renderSamples(parsed.samples);
  renderSummary(parsed.summary);
}

function parseNoilsRows(rows) {
  const samples = [];
  const summary = [];
  const meta = { testId: '', machineId: '', totalTest: '', numberEntries: '', stdNoils: '', noilsPct: '', tester: '' };

  rows.forEach((row) => {
    const rowType = (row['Row Type'] || '').trim().toLowerCase();
    if (!rowType) return;

    if (rowType === 'meta') {
      meta.testId = cleanDisplayValue(row['Test ID']);
      meta.machineId = cleanDisplayValue(row['Machine ID']);
      meta.totalTest = cleanDisplayValue(row['Total Test']);
      meta.numberEntries = cleanDisplayValue(row['Number of Entries (N)']);
      meta.stdNoils = cleanDisplayValue(row['Std. Noils %']);
      meta.tester = cleanDisplayValue(row['Tester']);
      meta.noilsPct = cleanDisplayValue(row['Noils %']);
      return;
    }

    if (rowType === 'sample') {
      samples.push({
        sampleNo: cleanDisplayValue(row['Sample No']),
        sliverWt: cleanDisplayValue(row['Sliver Wt']),
        noilsWt: cleanDisplayValue(row['Noils Wt']),
        noilsPct: cleanDisplayValue(row['Noils %']),
      });
      return;
    }

    if (rowType === 'summary') {
      summary.push({
        label: cleanDisplayValue(row['Label']),
        sliverWt: cleanDisplayValue(row['Sliver Wt']),
        noilsWt: cleanDisplayValue(row['Noils Wt']),
        noilsPct: cleanDisplayValue(row['Noils %']),
      });
    }
  });

  return { samples, summary, meta };
}

function backfillNoilsTester(meta, rawText) {
  if (meta.tester) return meta;
  const tester = extractTesterFromRawText(rawText);
  if (tester) {
    meta.tester = tester;
  }
  return meta;
}

function extractTesterFromRawText(rawText) {
  const text = String(rawText || '');
  if (!text.trim()) return '';

  const cleanTester = (value) => {
    let cleaned = String(value || '').replace(/\s+/g, ' ').trim().replace(/^[:=\-\s]+|[:=\-\s]+$/g, '');
    cleaned = cleaned.split(/\b(?:shift|process|date|page)\b/i)[0].trim();
    const match = cleaned.match(/^(.*?)(?:\s*\[(\d+)\])?$/);
    if (!match) return cleaned;
    const name = match[1].trim();
    const number = match[2];
    return number ? `${name} [${number}]` : name;
  };

  const patterns = [
    /(?:tester|tested\s*by|test\s*by|operator)\s*[:=\-]?\s*([A-Za-z][A-Za-z .,'/\-\[\]0-9]{1,120})/i,
    /\btester\s+name\s*[:=\-]?\s*([A-Za-z][A-Za-z .,'/\-\[\]0-9]{1,120})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return cleanTester(match[1]);
  }

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of [...lines.slice(0, 6), ...lines.slice(-6)]) {
    const match = line.match(/(?:tester|tested\s*by|test\s*by|operator)\s*[:=\-]?\s*(.+)$/i);
    if (match?.[1]) return cleanTester(match[1]);
  }

  return '';
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
    const tdSliver = document.createElement('td');
    const tdNoilsWt = document.createElement('td');
    const tdNoilsPct = document.createElement('td');

    tdNo.appendChild(makeInput(sample.sampleNo || String(idx + 1)));
    tdSliver.appendChild(makeInput(sample.sliverWt));
    tdNoilsWt.appendChild(makeInput(sample.noilsWt));
    tdNoilsPct.appendChild(makeInput(sample.noilsPct));

    tr.appendChild(tdNo);
    tr.appendChild(tdSliver);
    tr.appendChild(tdNoilsWt);
    tr.appendChild(tdNoilsPct);

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
    <div class="summary-label">Sliver Wt</div>
    <div class="summary-label">Noils Wt</div>
    <div class="summary-label">Noils %</div>
  `;
  summaryContainer.appendChild(header);

  summaryRows.forEach((row) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'summary-grid';

    const label = document.createElement('div');
    label.className = 'summary-label';
    label.textContent = cleanDisplayValue(row.label);

    const sliver = document.createElement('input');
    sliver.type = 'text';
    sliver.value = cleanDisplayValue(row.sliverWt);

    const noilsWt = document.createElement('input');
    noilsWt.type = 'text';
    noilsWt.value = cleanDisplayValue(row.noilsWt);

    const noilsPct = document.createElement('input');
    noilsPct.type = 'text';
    noilsPct.value = cleanDisplayValue(row.noilsPct);

    wrapper.appendChild(label);
    wrapper.appendChild(sliver);
    wrapper.appendChild(noilsWt);
    wrapper.appendChild(noilsPct);

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
