// The "Update Existing PP" matrix (process-parameter.js) shows short column
// labels, but the backend (pp_thresholds, the PP notebook breach ticket
// worker, submitted-notebooks pp-batch-config) keys everything by each
// notebook's actual registered name. These must stay in sync — saving a
// threshold under the display label instead of the real notebook key is
// exactly how "Mixing" silently failed to match "Mixing QC Header" and
// never raised an overdue ticket. Source of truth for the right-hand side:
// GET /submitted-notebooks/pp-batch-config's sub_departments[].notebooks[].notebook.
export const PP_NOTEBOOK_COLUMNS = [
  { label: "Mixing", notebookKey: "Mixing QC Header" },
  { label: "Blow Room", notebookKey: "Blowroom Header" },
  { label: "Carding", notebookKey: "Carding QC Header" },
  { label: "DF Breaker", notebookKey: "Drawframe QC Header" },
  { label: "DF Finisher", notebookKey: "Drawframe Finisher Drawing Inspection" },
  { label: "Simplex", notebookKey: "Simplex Process Parameter" },
  { label: "Spinning", notebookKey: "Spinning QC Header" },
  { label: "Autoconer PP", notebookKey: "Autoconer Process Parameter" },
  { label: "AC-Q2", notebookKey: "Autoconer Q2 Inspection" },
  { label: "AC-Q3", notebookKey: "Autoconer Q3 Inspection" },
  { label: "AC-Q4", notebookKey: "Autoconer Q4 Inspection" },
];

const normalize = (value) => String(value || "").trim().toLowerCase();

export const getNotebookKeyForColumn = (label) =>
  PP_NOTEBOOK_COLUMNS.find((item) => normalize(item.label) === normalize(label))?.notebookKey || label;

// Falls back to returning the input unchanged when it's not a known notebook
// key — which also keeps this backward-compatible with any threshold/ticket
// rows saved under the old free-text label before this fix.
export const getColumnForNotebookKey = (notebookKey) =>
  PP_NOTEBOOK_COLUMNS.find((item) => normalize(item.notebookKey) === normalize(notebookKey))?.label || notebookKey;

// ticketing_system.pp_notebook_threshold (PPNotebookThresholdPage.jsx's PP_NOTEBOOK_OPTIONS) keys
// its rows by a third, distinct naming convention from both the short column labels above and the
// registered notebook names in PP_NOTEBOOK_COLUMNS — e.g. "Mixing Process Parameter",
// "Drawframe Process Parameter (Breaker)", "Autoconer Process Parameter (Q2)". Needed for the
// "Update Existing PP" matrix's per-column overdue-threshold lookup, which reads this table.
const PP_NOTEBOOK_THRESHOLD_LABEL_TO_COLUMN = [
  { label: "Mixing", notebookThresholdLabel: "Mixing Process Parameter" },
  { label: "Blow Room", notebookThresholdLabel: "Blowroom Process Parameter" },
  { label: "Carding", notebookThresholdLabel: "Carding Process Parameter" },
  { label: "DF Breaker", notebookThresholdLabel: "Drawframe Process Parameter (Breaker)" },
  { label: "DF Finisher", notebookThresholdLabel: "Drawframe Process Parameter (Finisher)" },
  { label: "Simplex", notebookThresholdLabel: "Simplex Process Parameter" },
  { label: "Spinning", notebookThresholdLabel: "Spinning Process Parameter" },
  { label: "Autoconer PP", notebookThresholdLabel: "Autoconer Process Parameter" },
  { label: "AC-Q2", notebookThresholdLabel: "Autoconer Process Parameter (Q2)" },
  { label: "AC-Q3", notebookThresholdLabel: "Autoconer Process Parameter (Q3)" },
  { label: "AC-Q4", notebookThresholdLabel: "Autoconer Process Parameter (Q4)" },
];

export const getColumnForNotebookThresholdLabel = (notebookThresholdLabel) =>
  PP_NOTEBOOK_THRESHOLD_LABEL_TO_COLUMN.find(
    (item) => normalize(item.notebookThresholdLabel) === normalize(notebookThresholdLabel)
  )?.label || notebookThresholdLabel;
