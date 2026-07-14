$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$docsApiDir = Join-Path $repoRoot 'docs\api'
$outPath = Join-Path $docsApiDir 'Carding API Documentation.docx'
$tmp = Join-Path $repoRoot '__carding_api_docx'

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
  @('Wrapping Carding Notebook', 'POST/GET /wrapping-carding-notebook and aliases', 'Wrapping carding notebook rows'),
  @('Card Thick Place', 'POST/GET /card-thick-place', 'Card thick place CV header and machine values'),
  @('Between Within Card', 'POST/GET /between-within-card', 'Inspection, sample weights, and hanks'),
  @('NATI Data Entry', 'POST/GET /nati-data-entry', 'NATI header and neps detail entries'),
  @('UQC', 'POST/GET /uqc and GET /uqc/global', 'UQC data entry and global list'),
  @('DFK Pressure', 'POST/GET /dfk-pressure', 'DFK pressure checking data'),
  @('QC Header', 'POST/GET/PUT /qc-header', 'Carding QC/process parameter header'),
  @('Change Control', 'POST/GET /change-control', 'Existing vs proposed carding change request values'),
  @('Card Waste Study', 'POST/GET /card-waste-study', 'Waste study header, type rows, and waste rows')
)

$endpointRows = @(
  @('GET', '/carding/thresholds', 'Fetch Carding threshold settings'),
  @('POST', '/carding/wrapping-carding-notebook', 'Save Wrapping Carding Notebook'),
  @('GET', '/carding/wrapping-carding-notebook', 'List Wrapping Carding Notebook entries'),
  @('POST', '/carding/card-thick-place', 'Create Card Thick Place CV entry'),
  @('GET', '/carding/card-thick-place', 'List Card Thick Place entries with values'),
  @('GET', '/carding/card-thick-place/denominations', 'Fetch denomination metadata for CDG machine'),
  @('POST', '/carding/between-within-card', 'Create full Between/Within Card inspection'),
  @('GET', '/carding/between-within-card', 'List Between/Within Card inspections'),
  @('POST', '/carding/nati-data-entry', 'Create NATI Data Entry with neps details'),
  @('GET', '/carding/nati-data-entry', 'List NATI entries'),
  @('POST', '/carding/uqc', 'Create Carding UQC entry'),
  @('GET', '/carding/uqc', 'List Carding UQC entries'),
  @('GET', '/carding/uqc/global', 'List global UQC entries'),
  @('POST', '/carding/dfk-pressure', 'Create DFK Pressure Checking data'),
  @('GET', '/carding/dfk-pressure', 'List DFK Pressure Checking data'),
  @('POST', '/carding/qc-header', 'Create Carding QC Header entry'),
  @('GET', '/carding/qc-header', 'List Carding QC Header entries'),
  @('PUT', '/carding/qc-header/:qc_id', 'Update Carding QC Header entry'),
  @('POST', '/carding/change-control', 'Create Carding Change Control entry'),
  @('GET', '/carding/change-control', 'List Change Control entries'),
  @('POST', '/carding/card-waste-study', 'Create Card Waste Study'),
  @('GET', '/carding/card-waste-study', 'List Card Waste Study records with child rows')
)

$masterRows = @(
  @('GET', '/carding/master/machines', 'Machine dropdown from ticketing_system.mc_master'),
  @('GET', '/carding/master/varieties', 'Prep variety dropdown'),
  @('GET', '/carding/master/counts', 'Count Name dropdown from SQL Server Depot_CountMaster'),
  @('GET', '/carding/master/count-dropdown', 'Count Name alias'),
  @('GET', '/carding/master/count-names', 'Count Name alias'),
  @('GET', '/carding/master/employees', 'Employee dropdown'),
  @('GET', '/carding/master/departments', 'Department dropdown'),
  @('GET', '/carding/master/mc-nos', 'MC number dropdown'),
  @('GET', '/carding/master/checker-names', 'Checker name dropdown aliases'),
  @('GET', '/carding/master/dropdown', 'Common UQC master data'),
  @('GET', '/carding/uqc/master/dropdown', 'Common UQC master data alias'),
  @('GET', '/carding/nati/master/*', 'NATI-specific count, employee, variety, department, and MC aliases'),
  @('GET', '/carding/qc-header/master/*', 'QC Header-specific count and employee aliases'),
  @('GET', '/carding/change-control/master/*', 'Change Control-specific count, employee, and CDG aliases'),
  @('GET', '/carding/master/cdg-denominations', 'CDG total denomination threshold lookup')
)

$idRows = @(
  @('card_thick_place', '#CT-0001'),
  @('between_within_card', '#CB-0001'),
  @('nati_data_entry', '#CN-0001'),
  @('uqc', '#CU-0001'),
  @('dfk_pressure', '#CD-0001'),
  @('qc_header', '#CQ-0001'),
  @('card_change_control', '#CC-0001'),
  @('card_waste_study', '#CW-0001'),
  @('wrapping_carding_notebook', '#WR-0001')
)

$payloadRows = @(
  @('Common', 'entry_id', 'Required and unique for most create APIs'),
  @('Card Thick Place', 'entry_date/date, entry_time, remarks, entries', 'entries contain machine, cv_value/cv_5m/five_m_cv, unit'),
  @('Between Within Card', 'type_category, inspection_type, mc_name, inspection_date, sample_weights, hanks', 'sample_weights and hanks must be arrays with matching length'),
  @('NATI Data Entry', 'entry_id, date fields, entries', 'entries are inserted into neps_details'),
  @('UQC', 'entry_id, entry_type, entry_date, shift', 'shift must be General, Day, Half Night, or Full Night'),
  @('DFK Pressure', 'entry_id plus pressure row fields', 'requires at least one data field'),
  @('QC Header', 'type, count_name, consignee_name, creation_date, machine_no, speed/setting fields', 'PUT validates qc_id and updates process parameters'),
  @('Change Control', 'type, entry_date, existing/proposed parameter fields', 'tracks existing vs proposed carding settings'),
  @('Card Waste Study', 'entry_id/waste_study_id, study_type, type_rows, waste_rows', 'study_type must be Type 1, Type 2, or Type 3')
)

$queryRows = @(
  @('page', 'number', 'Optional page number for paginated list APIs; defaults to 1'),
  @('limit', 'number', 'Optional page size for paginated list APIs; defaults to 10'),
  @('prefix', 'string', 'Dropdown filter for count, department, machine, or employee endpoints'),
  @('count_prefix', 'string', 'Count Name dropdown filter'),
  @('machine_name', 'string', 'Required for CDG denomination endpoints; must match CDG-xx format')
)

$dbRows = @(
  @('carding.card_thick_place_header', 'Card Thick Place header records'),
  @('carding.card_thick_place_values', 'Card Thick Place machine CV rows'),
  @('carding.inspections', 'Between/Within Card inspection header'),
  @('carding.sample_weights', 'Between/Within Card sample weights'),
  @('carding.hanks', 'Between/Within Card hank values'),
  @('carding.nati_data_entry', 'NATI header records'),
  @('carding.neps_details', 'NATI child detail rows'),
  @('carding.u_data_entry', 'UQC records'),
  @('carding.card_dfk_pressure_checking', 'DFK pressure checking records'),
  @('carding.carding_qc_header', 'QC header/process parameter records'),
  @('carding.carding_change_request', 'Change control records'),
  @('carding.card_waste_study', 'Card waste study header records'),
  @('carding.card_waste_study_type_rows', 'Card waste study type rows'),
  @('carding.card_waste_study_waste_rows', 'Card waste study waste rows'),
  @('ticketing_system.threshold_master', 'Threshold and CDG denomination metadata'),
  @('ticketing_system.mc_master', 'Machine/departments dropdown source'),
  @('dbo.Depot_CountMaster', 'SQL Server count dropdown source')
)

$errorRows = @(
  @('400', 'Missing entry_id, missing arrays/rows, invalid shift, invalid qc_id, invalid study_type, or missing machine_name'),
  @('404', 'Carding QC entry not found'),
  @('409', 'Duplicate entry_id or duplicate waste study ID'),
  @('500', 'Unhandled database/server error'),
  @('503', 'SQL Server is not configured on backend for SQL Server-backed dropdowns')
)

$body = ''
$body += Para 'Carding API Documentation' 'Title' -Bold -Color '0B2545' -Size 36
$body += Para 'API reference for Carding backend routes, including data-entry APIs, QC/process parameter APIs, master-data dropdowns, thresholds, change control, and waste study.' 'Subtitle' -Color '4B5563' -Size 22
$body += Para 'Overview' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'The Carding API is mounted under /carding and /api/carding. It provides form submission endpoints, paginated list endpoints, threshold lookup, and shared master-data dropdown endpoints for Carding screens.'
$body += Bullet 'Base routes: /carding and /api/carding'
$body += Bullet 'Content type: application/json'
$body += Bullet 'Server mounts: server.js uses app.use("/carding", require("./routes/carding")) and app.use("/api/carding", require("./routes/carding")).'
$body += Bullet 'Some routes create or patch supporting Carding tables, entry_id columns, and indexes when called.'
$body += Para 'Module Summary' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Module', 'Main Route', 'Purpose') $moduleRows @(2500, 2800, 4060)
$body += Para 'Main Endpoints' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Method', 'Endpoint', 'Purpose') $endpointRows @(900, 3600, 4860)
$body += Para 'Master Data Endpoints' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Method', 'Endpoint', 'Purpose') $masterRows @(900, 3900, 4560)
$body += Para 'Display Entry IDs' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Screen Key', 'Format') $idRows @(4200, 5160)
$body += Para 'Payload Summary' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Module', 'Fields', 'Notes') $payloadRows @(2300, 3400, 3660)
$body += Para 'Common Query Parameters' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Parameter', 'Type', 'Description') $queryRows @(2300, 1600, 5460)
$body += Para 'Request Examples' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'POST /carding/card-thick-place { "entry_id": "#CT-0001", "entry_date": "2026-06-10", "entries": [{ "machine": "CDG-01", "cv_value": 3.245, "unit": "5m CV" }] }' 'Code'
$body += Para 'GET /carding/qc-header?page=1&limit=10' 'Code'
$body += Para 'Database Tables and Sources' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Table/Source', 'Purpose') $dbRows @(3900, 5460)
$body += Para 'Error Responses' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Status', 'Meaning') $errorRows @(1200, 8160)
$body += Para 'Implementation Notes' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Bullet 'Entry IDs are generated for display from screen-specific prefixes when a stored entry_id is absent.'
$body += Bullet 'Count dropdowns use SQL Server dbo.Depot_CountMaster and return 503 when SQL Server is not configured.'
$body += Bullet 'Variety dropdowns use prep variety helpers with the Carding context.'
$body += Bullet 'UQC master data is served through the shared UQC master data helper.'
$body += Bullet 'CDG denomination lookup reads active threshold_master rows where machine_name matches CDG-xx.'
$body += Bullet 'Card Waste Study calculates waste_kg, waste_percent, and overall_percent when enough values are supplied.'
$body += Bullet 'Allowed UQC shift values are General, Day, Half Night, and Full Night.'

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
  <dc:title>Carding API Documentation</dc:title>
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
