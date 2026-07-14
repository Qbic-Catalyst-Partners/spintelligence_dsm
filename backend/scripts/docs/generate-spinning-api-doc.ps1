$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$docsApiDir = Join-Path $repoRoot 'docs\api'
$outPath = Join-Path $docsApiDir 'Spinning API Documentation.docx'
$tmp = Join-Path $repoRoot '__spinning_api_docx'

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
  @('Speed Checking', 'POST/GET /speed-checking', 'Speed comparison readings with LHS/RHS audio remarks'),
  @('Cots Checking', 'POST/GET /cots-checking', 'Cots side measurements with 0-650 validation'),
  @('Lycra Missing', 'POST/GET /lycra-missing', 'Lycra missing inspection readings'),
  @('Bottom Apron Checking', 'POST/GET /bottom-apron-checking', 'Bottom apron inspection readings and employee dropdowns'),
  @('Lycra Centering', 'POST/GET /lycra-centering', 'Lycra centering inspection readings'),
  @('RSM Lycra Online/Offline', 'POST/GET /rsm-lycra-online and /rsm-lycra-offline', 'RSM and Lycra sensor checks'),
  @('Ring Frame', 'POST/GET /ring-frame', 'Ring Frame header, rows, summary, checker names, and shifts'),
  @('Count Change', 'POST/GET /count-change', 'Count change header with reading rows and CSP calculation'),
  @('QC', 'POST/GET/PUT /qc', 'Spinning QC parameter entries'),
  @('Wheel Change', 'POST/GET /wheel-change/type1, type2, type3', 'Three wheel-change form variants')
)

$endpointRows = @(
  @('GET', '/spinning/thresholds', 'Fetch active thresholds by management field, product code, machine, and optional parameters'),
  @('POST/GET', '/spinning/speed-checking', 'Create/list Speed Checking records'),
  @('POST/GET', '/spinning/cots-checking', 'Create/list Cots Checking records'),
  @('POST/GET', '/spinning/lycra-missing', 'Create/list Lycra Missing records'),
  @('POST/GET', '/spinning/bottom-apron-checking', 'Create/list Bottom Apron Checking records'),
  @('POST/GET', '/spinning/lycra-centering', 'Create/list Lycra Centering records'),
  @('POST/GET', '/spinning/rsm-lycra-online', 'Create/list RSM Lycra Online records'),
  @('POST/GET', '/spinning/rsm-lycra-offline', 'Create/list RSM Lycra Offline records'),
  @('POST/GET', '/spinning/ring-frame', 'Create/list Ring Frame inspections'),
  @('GET', '/spinning/ring-frame/master-data', 'Ring Frame shift and checker dropdowns'),
  @('POST/GET', '/spinning/count-change', 'Create/list Count Change inspections'),
  @('POST/GET/PUT', '/spinning/qc', 'Create/list/update Spinning QC entries'),
  @('POST/GET', '/spinning/wheel-change/type1', 'Create/list Wheel Change Type 1 entries'),
  @('POST/GET', '/spinning/wheel-change/type2', 'Create/list Wheel Change Type 2 entries'),
  @('POST/GET', '/spinning/wheel-change/type3', 'Create/list Wheel Change Type 3 entries')
)

$masterRows = @(
  @('GET', '/spinning/master/machines', 'Machine dropdown from SQL Server or Postgres fallback'),
  @('GET', '/spinning/master/varieties', 'Variety dropdown from SQL Server dbo.VARIETY'),
  @('GET', '/spinning/master/counts', 'Count Name dropdown from dbo.Depot_CountMaster'),
  @('GET', '/spinning/master/employees', 'Employee/operator dropdown'),
  @('GET', '/spinning/bottom-apron-checking/master/employees', 'Bottom Apron filtered employee/checker dropdown'),
  @('GET', '/spinning/cots-checking/master/varieties', 'Cots Checking variety aliases'),
  @('GET', '/spinning/count-change/dropdown', 'Count Change combined dropdowns'),
  @('GET', '/spinning/count-change/rf-nos', 'Count Change RF number dropdown'),
  @('GET', '/spinning/wheel-change/dropdown', 'Wheel Change variety, RF, and wheel value dropdowns'),
  @('GET', '/spinning/wheel-change/type1/dropdown', 'Wheel Change Type 1 dropdown alias'),
  @('GET', '/spinning/wheel-change/type2/dropdown', 'Wheel Change Type 2 dropdown alias'),
  @('GET', '/spinning/wheel-change/type3/dropdown', 'Wheel Change Type 3 dropdown alias'),
  @('GET', '/spinning/machine-numbers', 'Static Lycra/Ring Frame machine number dropdown'),
  @('GET', '/spinning/ring-frame/checker-names', 'Ring Frame checker dropdown'),
  @('GET', '/spinning/ring-frame/shifts', 'Ring Frame shift dropdown')
)

$payloadRows = @(
  @('Common LHS/RHS screens', 'entry_id, inspectiondate, machineno, employeename, lhs_value, rhs_value, lhs_textremarks, lhs_audio, rhs_textremarks, rhs_audio'),
  @('Speed Checking', 'Adds display_speed, spindle_speed, and auto-calculated difference'),
  @('Cots Checking', 'lhs_value and rhs_value must be whole numbers between 0 and 650'),
  @('Ring Frame', 'entry_id, inspection_type, entry_date, shift, checker_name, rows[], summary'),
  @('Count Change', 'entry_id, type, entry_date, rf_no, lycra_draft, count_name_from, count_name_to, readings[]'),
  @('QC', 'entry_id, count_name, consignee_name, creation_date, machine_no, roll settings, drafts, speed, denier, lycra fields'),
  @('Wheel Change Types', 'entry_id, wheel_change_type, test_no, date, RF/FM/FR number, existing/proposed count, lycra, draft, wheel, speed, traveller, spacer, color fields')
)

$queryRows = @(
  @('management_field', 'string', 'Required for /thresholds'),
  @('erp_product_code', 'string', 'Required for /thresholds'),
  @('machine_name', 'string', 'Required for /thresholds'),
  @('parameters', 'comma-separated string', 'Optional threshold parameter filter'),
  @('prefix', 'string', 'Optional dropdown search token'),
  @('count_prefix / variety_prefix / rf_prefix', 'string', 'Screen-specific dropdown filters'),
  @('page, limit', 'number', 'Used by QC list pagination')
)

$idRows = @(
  @('speed_checking', '#SSC-0001'),
  @('cots_checking', '#SCT-0001'),
  @('lycra_missing', '#SLM-0001'),
  @('bottom_apron_checking', '#SBA-0001'),
  @('lycra_centering', '#SLC-0001'),
  @('rsm_lycra_online', '#SRO-0001'),
  @('rsm_lycra_offline', '#SRF-0001'),
  @('ring_frame', '#SRI-0001'),
  @('count_change', '#SCC-0001'),
  @('qc', '#SQC-0001'),
  @('wheel_change_type1', '#SW1-0001'),
  @('wheel_change_type2', '#SW2-0001'),
  @('wheel_change_type3', '#SW3-0001')
)

$dbRows = @(
  @('spinning.speed_checking', 'Speed Checking records'),
  @('spinning.cots_checking', 'Cots Checking records'),
  @('spinning.lycra_missing', 'Lycra Missing records'),
  @('spinning.bottom_apron_checking', 'Bottom Apron Checking records'),
  @('spinning.lycra_centering', 'Lycra Centering records'),
  @('spinning.RSM_and_lycrasensor_cheking_online', 'RSM Lycra Online records'),
  @('spinning.RSM_and_lycrasensor_cheking_offline', 'RSM Lycra Offline records'),
  @('spinning.ring_frame_inspections', 'Ring Frame headers'),
  @('spinning.ring_frame_rows', 'Ring Frame row details'),
  @('spinning.ring_frame_summary', 'Ring Frame summary values'),
  @('spinning.ring_frame_checkers', 'Ring Frame checker names'),
  @('spinning.count_change_inspections', 'Count Change headers'),
  @('spinning.count_change_readings', 'Count Change readings'),
  @('spinning.spinning_qc_header', 'QC entries'),
  @('spinning.wheel_change_inspection', 'Wheel Change Type 1'),
  @('spinning.wheel_change_v2', 'Wheel Change Type 2'),
  @('spinning.wheel_change', 'Wheel Change Type 3'),
  @('ticketing_system.threshold_master', 'Threshold lookup source')
)

$errorRows = @(
  @('400', 'Missing entry_id, required threshold fields, invalid QC ID, missing RF number, or invalid Cots side measurements'),
  @('404', 'QC update target not found'),
  @('409', 'Duplicate entry_id on unique-entry create routes'),
  @('503', 'SQL Server is not configured for SQL Server-backed dropdown endpoints'),
  @('500', 'Unhandled database/server error')
)

$body = ''
$body += Para 'Spinning API Documentation' 'Title' -Bold -Color '0B2545' -Size 36
$body += Para 'API reference for routes/spinning.js, including Spinning inspection screens, Ring Frame, Count Change, QC, Wheel Change, thresholds, and master-data dropdowns.' 'Subtitle' -Color '4B5563' -Size 22
$body += Para 'Overview' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'The Spinning API is mounted under /spinning. It provides data-entry endpoints, list endpoints, SQL Server-backed dropdowns, threshold lookup, Ring Frame log-book support, Count Change readings, QC parameters, and Wheel Change variants.'
$body += Bullet 'Base route: /spinning'
$body += Bullet 'Content type: application/json'
$body += Bullet 'Server mount: server.js uses app.use("/spinning", require("./routes/spinning")).'
$body += Bullet 'Create routes require entry_id and maintain unique indexes for display IDs.'
$body += Para 'Module Summary' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Module', 'Main Route', 'Purpose') $moduleRows @(2300, 3400, 3660)
$body += Para 'Main Endpoints' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Method', 'Endpoint', 'Purpose') $endpointRows @(1100, 3600, 4660)
$body += Para 'Master Data Endpoints' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'Spinning exposes many alias routes for frontend dropdown compatibility. Use these representative endpoints for machine, variety, count, employee, RF, Ring Frame, and Wheel Change dropdowns.'
$body += Table @('Method', 'Endpoint', 'Purpose') $masterRows @(900, 3900, 4560)
$body += Para 'Payload Summary' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Screen', 'Main Fields') $payloadRows @(2400, 6960)
$body += Para 'Common Query Parameters' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Parameter', 'Type', 'Description') $queryRows @(2800, 2200, 4360)
$body += Para 'Entry ID Formats' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Screen Key', 'Format') $idRows @(5200, 4160)
$body += Para 'Request Examples' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'GET /spinning/thresholds?management_field=Spinning&erp_product_code=40s&machine_name=RF%2001&parameters=Speed' 'Code'
$body += Para 'POST /spinning/count-change' 'Code'
$body += Para '{ "entry_id": "#SCC-0001", "type": "Count Change", "entry_date": "2026-06-10", "rf_no": "R/F NO 01", "count_name_from": "40s", "count_name_to": "50s", "readings": [{ "reading_no": 1, "count": 40, "strength": 250 }] }' 'Code'
$body += Para 'Database Tables' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Table', 'Usage') $dbRows @(3800, 5560)
$body += Para 'Error Responses' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Status', 'Meaning') $errorRows @(1200, 8160)
$body += Para 'Implementation Notes' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Bullet 'ensureSpinningEntryIdColumns adds entry_id columns and unique indexes across the Spinning screen tables.'
$body += Bullet 'withScreenEntryId formats stored numeric IDs using screen-specific prefixes such as SSC, SRI, SCC, SQC, SW1, SW2, and SW3.'
$body += Bullet 'Count Change calculates CSP as count multiplied by strength when csp is not supplied.'
$body += Bullet 'Ring Frame creates supporting checker tables and stores header, row, and summary data in separate tables.'
$body += Bullet 'Wheel Change Type 3 accepts many legacy field aliases and normalizes RF number and existing/proposed wheel fields.'

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
  <dc:title>Spinning API Documentation</dc:title>
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
