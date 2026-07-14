$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$docsApiDir = Join-Path $repoRoot 'docs\api'
$outPath = Join-Path $docsApiDir 'Drawframe API Documentation.docx'
$tmp = Join-Path $repoRoot '__drawframe_api_docx'

if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
if (Test-Path $outPath) { Remove-Item -Force $outPath }

New-Item -ItemType Directory -Force -Path $docsApiDir | Out-Null
New-Item -ItemType Directory -Path $tmp | Out-Null
New-Item -ItemType Directory -Path (Join-Path $tmp '_rels') | Out-Null
New-Item -ItemType Directory -Path (Join-Path $tmp 'docProps') | Out-Null
New-Item -ItemType Directory -Path (Join-Path $tmp 'word') | Out-Null
New-Item -ItemType Directory -Path (Join-Path $tmp 'word\_rels') | Out-Null

function Escape-Xml([string]$value) {
  if ($null -eq $value) { return '' }
  return [System.Security.SecurityElement]::Escape($value)
}

function Run([string]$text, [switch]$Bold, [string]$Color = '000000', [int]$Size = 22) {
  $escaped = Escape-Xml $text
  $boldXml = if ($Bold) { '<w:b/>' } else { '' }
  return "<w:r><w:rPr>$boldXml<w:color w:val=`"$Color`"/><w:sz w:val=`"$Size`"/><w:szCs w:val=`"$Size`"/></w:rPr><w:t xml:space=`"preserve`">$escaped</w:t></w:r>"
}

function Para([string]$text, [string]$style = 'Normal', [switch]$Bold, [string]$Color = '000000', [int]$Size = 22) {
  return "<w:p><w:pPr><w:pStyle w:val=`"$style`"/></w:pPr>$(Run $text -Bold:$Bold -Color $Color -Size $Size)</w:p>"
}

function Bullet([string]$text) {
  return "<w:p><w:pPr><w:pStyle w:val=`"Bullet`"/><w:numPr><w:ilvl w:val=`"0`"/><w:numId w:val=`"1`"/></w:numPr></w:pPr>$(Run $text)</w:p>"
}

function Cell([string]$text, [int]$width, [switch]$Header) {
  $fill = if ($Header) { '<w:shd w:fill="E8EEF5"/>' } else { '' }
  $bold = if ($Header) { '<w:b/>' } else { '' }
  $escaped = Escape-Xml $text
  return @"
<w:tc>
  <w:tcPr><w:tcW w:w="$width" w:type="dxa"/>$fill<w:tcMar><w:top w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:start w:w="120" w:type="dxa"/><w:end w:w="120" w:type="dxa"/></w:tcMar></w:tcPr>
  <w:p><w:r><w:rPr>$bold<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t xml:space="preserve">$escaped</w:t></w:r></w:p>
</w:tc>
"@
}

function Row([string[]]$cells, [int[]]$widths, [switch]$Header) {
  $xml = '<w:tr>'
  for ($i = 0; $i -lt $cells.Count; $i++) {
    $xml += Cell $cells[$i] $widths[$i] -Header:$Header
  }
  $xml += '</w:tr>'
  return $xml
}

function Table([string[]]$headers, [object[]]$rows, [int[]]$widths) {
  $grid = ($widths | ForEach-Object { "<w:gridCol w:w=`"$_`"/>" }) -join ''
  $xml = @"
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="9360" w:type="dxa"/>
    <w:tblInd w:w="120" w:type="dxa"/>
    <w:tblBorders><w:top w:val="single" w:sz="4" w:color="B7C3D0"/><w:left w:val="single" w:sz="4" w:color="B7C3D0"/><w:bottom w:val="single" w:sz="4" w:color="B7C3D0"/><w:right w:val="single" w:sz="4" w:color="B7C3D0"/><w:insideH w:val="single" w:sz="4" w:color="D5DCE5"/><w:insideV w:val="single" w:sz="4" w:color="D5DCE5"/></w:tblBorders>
    <w:tblLook w:firstRow="1" w:noHBand="0" w:noVBand="1"/>
  </w:tblPr>
  <w:tblGrid>$grid</w:tblGrid>
"@
  $xml += Row $headers $widths -Header
  foreach ($r in $rows) { $xml += Row ([string[]]$r) $widths }
  $xml += '</w:tbl>'
  return $xml
}

$moduleRows = @(
  @('Wrapping Notebook', 'POST/GET /wrapping-drawframe-notebook', 'Drawframe wrapping notebook readings'),
  @('A Percent', 'POST/GET /a-percent', 'OCR/import style A% inspection data'),
  @('Stretch Percent', 'POST/GET /stretch-percent', 'Stretch percent inspection data'),
  @('Comber Noil Percent', 'POST/GET /comber-noil-percent', 'Noil percent inspection data'),
  @('Yarn CV%', 'POST/GET /yarn-cv', 'Yarn CV% header and yard result values'),
  @('Cots', 'POST/GET /cots', 'Breaker and Finisher cots data entry'),
  @('UQC', 'POST/GET /uqc', 'U% quality data entry'),
  @('Header', 'POST/GET/PUT /header', 'Drawframe QC header/process parameter entries'),
  @('Wheel Change', 'POST/GET /wheel-change/*', 'Wheel change records by machine/type variant'),
  @('Finisher', 'POST/GET/PUT /finisher', 'Finisher drawing inspection entries')
)

$endpointRows = @(
  @('GET', '/drawframe/thresholds', 'Fetch active threshold settings for management_field, erp_product_code, and machine_name'),
  @('POST', '/drawframe/wrapping-drawframe-notebook', 'Create Wrapping Drawframe Notebook entry'),
  @('GET', '/drawframe/wrapping-drawframe-notebook', 'List Wrapping Drawframe Notebook entries'),
  @('POST/GET', '/drawframe/a-percent', 'Create/list A Percent inspection entries'),
  @('POST/GET', '/drawframe/stretch-percent', 'Create/list Stretch Percent inspection entries'),
  @('POST/GET', '/drawframe/comber-noil-percent', 'Create/list Comber Noil Percent inspection entries'),
  @('POST', '/drawframe/yarn-cv', 'Create Yarn CV% entry with yard results'),
  @('GET', '/drawframe/yarn-cv', 'List Yarn CV% entries'),
  @('POST', '/drawframe/cots', 'Create Cots entry for Breaker or Finisher'),
  @('GET', '/drawframe/cots', 'List Cots entries'),
  @('POST', '/drawframe/uqc', 'Create UQC entry'),
  @('GET', '/drawframe/uqc', 'List UQC entries'),
  @('POST', '/drawframe/header', 'Create Drawframe QC header entry'),
  @('GET', '/drawframe/header', 'List Drawframe QC header entries'),
  @('PUT', '/drawframe/header/:ins_id', 'Update Drawframe QC header entry'),
  @('POST/GET', '/drawframe/wheel-change', 'Create/list generic wheel change entries'),
  @('POST/GET', '/drawframe/wheel-change/type1', 'Wheel Change Type 1 (SB20)'),
  @('POST/GET', '/drawframe/wheel-change/type2', 'Wheel Change Type 2 (TD7)'),
  @('POST/GET', '/drawframe/wheel-change/type3', 'Wheel Change Type 3 (TD9)'),
  @('POST/GET', '/drawframe/wheel-change/finisher-type1-lrsb', 'Wheel Change Type 1 (LRSB)'),
  @('POST/GET', '/drawframe/wheel-change/type2-d40', 'Wheel Change Type 2 (D40)'),
  @('POST/GET', '/drawframe/wheel-change/type3-d50-d55', 'Wheel Change Type 3 (D50/D55)'),
  @('POST/GET', '/drawframe/wheel-change/type4-ldf3s', 'Wheel Change Type 4 (LDF3S)'),
  @('POST', '/drawframe/finisher', 'Create Finisher Drawing Inspection entry'),
  @('GET', '/drawframe/finisher', 'List Finisher Drawing Inspection entries'),
  @('PUT', '/drawframe/finisher/:id', 'Update Finisher Drawing Inspection entry')
)

$masterRows = @(
  @('GET', '/drawframe/master/machines', 'Drawframe machine master list from SQL Server or PostgreSQL fallback'),
  @('GET', '/drawframe/yarn-cv/machine-numbers', 'Yarn CV machine numbers filtered to Drawframe FR machines'),
  @('GET', '/drawframe/machine-numbers', 'Alias for Yarn CV machine numbers'),
  @('GET', '/drawframe/cots/machine-numbers', 'Cots machine numbers with sub_type Breaker or Finisher'),
  @('GET', '/drawframe/master/dropdown', 'Combined UQC dropdowns: shifts, varieties, departments, MC numbers'),
  @('GET', '/drawframe/master/varieties', 'Variety dropdown'),
  @('GET', '/drawframe/master/departments', 'Department dropdown'),
  @('GET', '/drawframe/master/mc-nos', 'MC number dropdown'),
  @('GET', '/drawframe/master/employees', 'Employee/user dropdown'),
  @('GET', '/drawframe/uqc/master/*', 'UQC aliases for dropdown, varieties, departments, MC numbers, and employees')
)

$aliasRows = @(
  @('Wrapping Notebook', '/wrapping/drawframe-notebook, /drawframe-notebook/wrapping', 'Aliases for /wrapping-drawframe-notebook'),
  @('A Percent', '/a-percent-inspection, /wrapping/a-percent, /wrapping/drawframe/a-percent', 'Aliases for /a-percent'),
  @('Stretch Percent', '/stretch-percent-inspection, /stretch-percentage, /wrapping/stretch-percent, /wrapping/stretch-percentage, /wrapping/drawframe/stretch-percent', 'Aliases for /stretch-percent'),
  @('Comber Noil Percent', '/comber-noil-percent-inspection, /noil-percent, /noils-percent, /wrapping/comber-noil-percent, /wrapping/noil-percent, /wrapping/noils-percent, /wrapping/drawframe/comber-noil-percent', 'Aliases for /comber-noil-percent'),
  @('Master Data', '/uqc/master/dropdown, /uqc/master/varieties, /uqc/master/departments, /uqc/master/mc-nos, /uqc/master/employees', 'UQC-specific aliases for shared Drawframe dropdowns')
)

$idRows = @(
  @('yarn_cv', '#DY-0001', 'Yarn CV% records'),
  @('cots', '#DC-0001', 'Cots records'),
  @('uqc', '#DU-0001', 'UQC records'),
  @('header', '#DH-0001', 'Header records using ins_id'),
  @('finisher', '#DF-0001', 'Finisher Drawing Inspection records'),
  @('wheel_change', '#AWH-0001', 'Wheel Change records'),
  @('wrapping_drawframe_notebook', '#WD-0001', 'Wrapping Drawframe Notebook records'),
  @('wrapping_a_percent', '#WA-0001', 'A Percent wrapping records'),
  @('wrapping_stretch_percent', '#WSP-0001', 'Stretch Percent wrapping records'),
  @('wrapping_comber_noil_percent', '#WNP-0001', 'Comber Noil Percent wrapping records')
)

$payloadRows = @(
  @('Wrapping Notebook', 'entry_id, serial_no, date_text/entry_date, source_id, mac_name, shift, std_hank, avg_hank, sd, cv, user_name, remark'),
  @('A/Stretch/Noil Percent', 'entry_id, entry_type, schema_name, table_name, pdf_file, meta, sample_rows, summary_rows, rows, raw_ocr_rows'),
  @('Yarn CV%', 'entry_id, type, s_no, entry_date, machine_number, remarks, num_readings, results.avg_1yd/hank_1yd/sd_1yd/cv_1yd/avg_half/hank_half/sd_half/cv_half'),
  @('Cots', 'entry_id, entry_date, shift, sub_type, machines[] with mc_name, fan_waste, cot_change, stripper_w, thick_place, plus Finisher-only fields'),
  @('UQC', 'entry_id, entry_type, entry_date, shift, variety, department, mc_no, u_percent, cvm, cvm_1m, cvm_3m, remarks'),
  @('Header', 'type, count_name, consignee_name, creation_date, make, no_of_ends, bottom_roll_setting, breaker_draft, total_draft, hank, web_tension_draft, trumpet_size, delivery_speed, pressure_bar'),
  @('Wheel Change', 'entry_id, type, line_type, wheel_change_type, wheel_change_type_label, entry_date/date, parameters, rows'),
  @('Finisher', 'count_name, consignee_name, creation_date, make, no_of_ends, bottom_roll_setting, break_draft, total_draft, web_tension_draft, trumpet_size, insert_size, web_funnel_size, delivery_hank, delivery_speed, pressure_bar, scanning_rolls_size')
)

$queryRows = @(
  @('page', 'number', 'Optional page number for list APIs; defaults to 1'),
  @('limit', 'number', 'Optional page size for list APIs; defaults to 10 and is capped at 100 on some endpoints'),
  @('prefix', 'string', 'Master-data filter for machine, variety, department, or MC number searches'),
  @('sub_type', 'string', 'Cots machine-number filter: Breaker or Finisher'),
  @('dept_code/dept_name', 'string', 'Optional SQL Server machine master filters'),
  @('management_field, erp_product_code, machine_name', 'string', 'Required by /thresholds'),
  @('parameters', 'comma-separated string', 'Optional threshold parameter names')
)

$dbRows = @(
  @('drawframe.yarn_cv_percent', 'Yarn CV% parent rows'),
  @('drawframe.yarn_cv_yard_results', 'Yarn CV% yard result child rows'),
  @('drawframe.cots_data_entry', 'Cots parent rows'),
  @('drawframe.cots_breaker_data / cots_finisher_data', 'Cots machine detail rows'),
  @('drawframe.u_data_entry', 'UQC entries'),
  @('drawframe.drawframe_qc_header', 'Header/process parameter records'),
  @('drawframe.wheel_change', 'Wheel change records with JSONB parameters and rows'),
  @('drawframe.finisher_drawing_inspection', 'Finisher drawing inspection records'),
  @('wrapping.drawframe_notebook', 'Wrapping notebook records'),
  @('wrapping.a_percent / stretch_percent / comber_noil_percent', 'Wrapping/OCR inspection records'),
  @('ticketing_system.threshold_master', 'Threshold lookup records'),
  @('SQL Server MCMASTER, dept_mai, prepvariety', 'Machine, department, and variety dropdown sources')
)

$errorRows = @(
  @('400', 'Missing entry_id, required date/type fields, invalid ID, or missing threshold query values'),
  @('404', 'Header or Finisher update target not found'),
  @('409', 'Duplicate entry_id on unique-entry screens'),
  @('500', 'Unhandled database/server error'),
  @('503', 'SQL Server is not configured for SQL Server-only dropdown endpoints')
)

$body = ''
$body += Para 'Drawframe API Documentation' 'Title' -Bold -Color '0B2545' -Size 36
$body += Para 'API reference for Drawframe backend routes, including Yarn CV%, Cots, UQC, Header, Wheel Change, Finisher, Wrapping screens, thresholds, and master-data dropdowns.' 'Subtitle' -Color '4B5563' -Size 22
$body += Para 'Overview' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'The Drawframe API is mounted under /drawframe. It provides data-entry endpoints, paginated list endpoints, threshold lookup, SQL Server-backed master data, and compatibility aliases for several Drawframe and Wrapping screens.'
$body += Bullet 'Base route: /drawframe'
$body += Bullet 'Content type: application/json for create and update requests.'
$body += Bullet 'Server mount: server.js uses app.use("/drawframe", require("./routes/drawframe")).'
$body += Bullet 'Some endpoints create or alter missing Drawframe/Wrapping tables and entry_id indexes before saving data.'
$body += Para 'Module Summary' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Module', 'Main Route', 'Purpose') $moduleRows @(2300, 3000, 4060)
$body += Para 'Main Endpoints' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Method', 'Endpoint', 'Purpose') $endpointRows @(1000, 3900, 4460)
$body += Para 'Master Data Endpoints' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Method', 'Endpoint', 'Purpose') $masterRows @(900, 3700, 4760)
$body += Para 'Compatibility Aliases' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Screen', 'Alias Routes', 'Notes') $aliasRows @(1900, 5100, 2360)
$body += Para 'Display Entry IDs' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Screen Key', 'Format', 'Notes') $idRows @(2600, 1800, 4960)
$body += Para 'Payload Field Summary' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Screen', 'Main Fields') $payloadRows @(2400, 6960)
$body += Para 'Request Examples' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'POST /drawframe/yarn-cv' 'Code'
$body += Para '{ "entry_id": "DY-1001", "type": "Yarn CV%", "entry_date": "2026-06-10", "machine_number": "FR (HSR 1000-1)", "num_readings": 2, "results": { "avg_1yd": 5.3, "hank_1yd": 1.2, "sd_1yd": 0.15, "cv_1yd": 2.8, "avg_half": 2.65, "hank_half": 0.6, "sd_half": 0.1, "cv_half": 3.2 } }' 'Code'
$body += Para 'GET /drawframe/master/dropdown?prefix=FR' 'Code'
$body += Para 'GET /drawframe/thresholds?management_field=Quality&erp_product_code=Drawframe&machine_name=FR-1&parameters=u_percent,cvm' 'Code'
$body += Para 'Common Query Parameters' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Parameter', 'Type', 'Description') $queryRows @(2600, 1800, 4960)
$body += Para 'Database Tables and Sources' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Table/Source', 'Usage') $dbRows @(3600, 5760)
$body += Para 'Error Responses' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Status', 'Meaning') $errorRows @(1200, 8160)
$body += Para 'Implementation Notes' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Bullet 'Entry display IDs are produced by formatScreenEntryId and withScreenEntryId when a persisted numeric ID is available.'
$body += Bullet 'Yarn CV%, Cots, UQC, and wrapping screens require a unique entry_id for creates.'
$body += Bullet 'Cots machine-number filtering uses DRAWFRAME_BREAKER_PREFIX and DRAWFRAME_FINISHER_PREFIX, defaulting to BR and FR.'
$body += Bullet 'Finisher machine-number dropdowns include fixed FR machine names when SQL Server does not return them.'
$body += Bullet 'Master dropdowns return both raw data arrays and frontend-friendly options arrays.'

$documentXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    $body
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>
  </w:body>
</w:document>
"@

$stylesXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="120"/></w:pPr><w:rPr><w:b/><w:color w:val="0B2545"/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:color w:val="4B5563"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="2E74B5"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Bullet"><w:name w:val="Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="80"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="80" w:after="160"/><w:shd w:fill="F2F4F7"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr></w:style>
</w:styles>
"@

$numberingXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#x2022;"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>
"@

$contentTypesXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>
"@

$relsXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>
"@

$docRelsXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>
"@

$coreXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Drawframe API Documentation</dc:title>
  <dc:creator>Codex</dc:creator>
  <cp:lastModifiedBy>Codex</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">2026-06-10T00:00:00Z</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">2026-06-10T00:00:00Z</dcterms:modified>
</cp:coreProperties>
"@

$appXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Codex</Application>
</Properties>
"@

[System.IO.File]::WriteAllText((Join-Path $tmp '[Content_Types].xml'), $contentTypesXml, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText((Join-Path $tmp '_rels\.rels'), $relsXml, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText((Join-Path $tmp 'word\document.xml'), $documentXml, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText((Join-Path $tmp 'word\styles.xml'), $stylesXml, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText((Join-Path $tmp 'word\numbering.xml'), $numberingXml, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText((Join-Path $tmp 'word\_rels\document.xml.rels'), $docRelsXml, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText((Join-Path $tmp 'docProps\core.xml'), $coreXml, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText((Join-Path $tmp 'docProps\app.xml'), $appXml, [System.Text.UTF8Encoding]::new($false))

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($tmp, $outPath)
Remove-Item -Recurse -Force $tmp

Write-Output $outPath
