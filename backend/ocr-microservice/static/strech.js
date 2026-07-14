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
const tablesContainer = $('tablesContainer');

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
  formData.append('doc_type', 'strech');

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
    const rows = getRowsFromOcrResponse(data);
    if (rows.length === 0) {
      throw new Error('OCR completed but no Stretch rows were returned.');
    }
    renderTables(parseStrechRows(rows));
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

function parseStrechRows(rows) {
  const tables = new Map();

  rows.forEach((row) => {
    const tableNo = row['Table No'] || '1';
    if (!tables.has(tableNo)) {
      tables.set(tableNo, {
        tableNo,
        meta: {
          testId: '',
          totalTest: '',
          numberEntries: '',
          length: '',
          stdStretch: '',
          stretchPct: '',
          remark: '',
        },
        samples: [],
        summary: [],
      });
    }

    const table = tables.get(tableNo);
    const rowType = (row['Row Type'] || '').trim().toLowerCase();

    if (rowType === 'meta') {
      table.meta.testId = cleanDisplayValue(row['Test ID']);
      table.meta.totalTest = cleanDisplayValue(row['Total Test']);
      table.meta.numberEntries = cleanDisplayValue(row['Number of Entries (N)']);
      table.meta.length = cleanDisplayValue(row.Length);
      table.meta.stdStretch = cleanDisplayValue(row['Std. Stretch %']);
      table.meta.stretchPct = cleanDisplayValue(row['Stretch %']);
      table.meta.remark = cleanDisplayValue(row['Remark']);
      return;
    }

    if (rowType === 'sample') {
      table.samples.push({
        sampleNo: cleanDisplayValue(row['Sample No']),
        initialBobbin: cleanDisplayValue(row['Initial Bobbin']),
        fullBobbin: cleanDisplayValue(row['Full Bobbin']),
      });
      return;
    }

    if (rowType === 'summary') {
      table.summary.push({
        label: cleanDisplayValue(row['Label']),
        initialBobbin: cleanDisplayValue(row['Initial Bobbin']),
        fullBobbin: cleanDisplayValue(row['Full Bobbin']),
      });
    }
  });

  return Array.from(tables.values());
}

function renderTables(tables) {
  tablesContainer.innerHTML = '';

  if (tables.length === 0) {
    tablesContainer.innerHTML = '<p class="empty-state">No Stretch tables detected.</p>';
    return;
  }

  tables.forEach((table) => {
    const block = document.createElement('div');
    block.className = 'stretch-table-block';

    const total = table.meta.totalTest || table.samples.length.toString();
    const title = document.createElement('div');
    title.className = 'stretch-table-title';
    title.innerHTML = `
      <div>Table ${escapeHtml(table.tableNo)}</div>
      <span>${escapeHtml(table.meta.testId ? `Test ID: ${table.meta.testId}` : '')}</span>
    `;

    block.appendChild(title);
    block.appendChild(renderMeta(table.meta, total));
    block.appendChild(renderSampleTable(table.samples));
    block.appendChild(renderMetricsTable(table.summary));
    tablesContainer.appendChild(block);
  });
}

function renderMeta(meta, total) {
  const grid = document.createElement('div');
  grid.className = 'meta-grid';

  const fields = [
    ['Test ID', meta.testId],
    ['Total Test', total],
    ['Number of Entries (N)', meta.numberEntries || total],
    ['Length', meta.length],
    ['Std. Stretch %', meta.stdStretch],
    ['Stretch %', meta.stretchPct],
    ['Remark', meta.remark, 'remark-field'],
  ];

  fields.forEach(([label, value, extraClass]) => {
    const wrapper = document.createElement('div');
    wrapper.className = `form-field ${extraClass || ''}`.trim();
    wrapper.innerHTML = `
      <label>${escapeHtml(label)}</label>
      <input type="text" value="${escapeAttr(cleanDisplayValue(value))}" />
    `;
    grid.appendChild(wrapper);
  });

  return grid;
}

function renderSampleTable(samples) {
  const wrapper = document.createElement('div');
  wrapper.className = 'table-wrapper';

  const table = document.createElement('table');
  table.className = 'sample-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th style="width: 110px;">Sample No</th>
        <th>Initial Bobbin</th>
        <th>Full Bobbin</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector('tbody');
  if (samples.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="color:#94a3b8;">No rows detected.</td></tr>';
  }

  samples.forEach((sample, idx) => {
    tbody.appendChild(renderValueRow(sample.sampleNo || (idx + 1), sample.initialBobbin, sample.fullBobbin));
  });

  wrapper.appendChild(table);
  return wrapper;
}

function renderMetricsTable(summary) {
  const section = document.createElement('div');
  section.className = 'metrics-section';

  const label = document.createElement('div');
  label.className = 'metrics-title';
  label.textContent = 'Metrics';
  section.appendChild(label);

  const wrapper = document.createElement('div');
  wrapper.className = 'table-wrapper';

  const table = document.createElement('table');
  table.className = 'sample-table metrics-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th style="width: 110px;">Metric</th>
        <th>Initial Bobbin</th>
        <th>Full Bobbin</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector('tbody');
  if (summary.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="color:#94a3b8;">No metrics detected.</td></tr>';
  }

  summary.forEach((row) => {
    tbody.appendChild(renderValueRow(row.label, row.initialBobbin, row.fullBobbin, true));
  });

  wrapper.appendChild(table);
  section.appendChild(wrapper);
  return section;
}

function renderValueRow(label, initialBobbin, fullBobbin, isSummary = false) {
  const tr = document.createElement('tr');
  if (isSummary) tr.style.fontWeight = '700';
  tr.innerHTML = `
    <td><input type="text" value="${escapeAttr(cleanDisplayValue(label))}" /></td>
    <td><input type="text" value="${escapeAttr(cleanDisplayValue(initialBobbin))}" /></td>
    <td><input type="text" value="${escapeAttr(cleanDisplayValue(fullBobbin))}" /></td>
  `;
  return tr;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value);
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
