$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$docsApiDir = Join-Path $repoRoot 'docs\api'
$outPath = Join-Path $docsApiDir 'Comber API Documentation.docx'
$tmp = Join-Path $repoRoot '__comber_api_docx'

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
  @('Lap CV / Ribbon Lap CV', 'POST/GET /lap-cv', 'Ribbon lap CV QC header and sample values'),
  @('NATI Data Entry', 'POST/GET /nati-data-entry', 'NATI header and neps detail entries'),
  @('UQC', 'POST/GET /uqc', 'U% data entry records')
)

$endpointRows = @(
  @('GET', '/comber/thresholds', 'Fetch Comber threshold settings'),
  @('POST', '/comber/lap-cv', 'Create Lap/Ribbon Lap CV entry with samples'),
  @('GET', '/comber/lap-cv', 'List Lap/Ribbon Lap CV entries with samples'),
  @('POST', '/comber/nati-data-entry', 'Create NATI Data Entry with neps details'),
  @('GET', '/comber/nati-data-entry', 'List NATI Data Entries'),
  @('POST', '/comber/uqc', 'Create Comber UQC entry'),
  @('GET', '/comber/uqc', 'List Comber UQC entries with pagination')
)

$masterRows = @(
  @('GET', '/comber/master/varieties', 'Prep variety dropdown for Comber'),
  @('GET', '/comber/master/dropdown', 'Alias for variety dropdown'),
  @('GET', '/comber/master/counts', 'Count Name dropdown from SQL Server Depot_CountMaster'),
  @('GET', '/comber/master/count-dropdown', 'Count Name alias'),
  @('GET', '/comber/master/count-names', 'Count Name alias'),
  @('GET', '/comber/master/employees', 'Employee dropdown'),
  @('GET', '/comber/master/employee-dropdown', 'Employee dropdown alias'),
  @('GET', '/comber/master/employee-names', 'Employee dropdown alias'),
  @('GET', '/comber/master/user-names', 'User-name dropdown alias'),
  @('GET', '/comber/lap-cv/master/*', 'Lap CV variety and count aliases'),
  @('GET', '/comber/ribbon-lap-cv/master/*', 'Ribbon Lap CV variety and count aliases'),
  @('GET', '/comber/uqc/master/counts', 'UQC count dropdown'),
  @('GET', '/comber/uqc/master/dropdown', 'UQC master dropdown: shift, variety, department, mc_no'),
  @('GET', '/comber/nati/master/varieties', 'NATI prep variety dropdown with access-denied handling'),
  @('GET', '/comber/nati/master/counts', 'NATI count dropdown'),
  @('GET', '/comber/nati/master/employees', 'NATI employee dropdown'),
  @('GET', '/comber/nati/master/departments', 'NATI department dropdown from SQL Server'),
  @('GET', '/comber/nati/master/mc-nos', 'NATI MC number dropdown from SQL Server MCMASTER')
)

$idRows = @(
  @('lap_cv', '#CL-0001'),
  @('nati_data_entry', '#CN-0001'),
  @('uqc', '#CU-0001')
)

$payloadRows = @(
  @('Lap CV', 'entry_id, record_date, machine_name, variety, type, lap_weight, samples, average, minimum, maximum, std_deviation, cv_percent', 'entry_id and samples are required'),
  @('NATI Data Entry', 'entry_id, type, nati_id, entry_date, variety, entries', 'entries contain mc_no, ratio_size_1, ratio_size_07, ratio_size_05'),
  @('UQC', 'entry_id, entry_type, entry_date, shift, variety, department, mc_no, u_percent, cvm, cvm_1m, cvm_3m, remarks', 'entry_id, entry_type, and entry_date are required')
)

$queryRows = @(
  @('management_field', 'string', 'Required by /thresholds'),
  @('erp_product_code', 'string', 'Required by /thresholds'),
  @('machine_name', 'string', 'Required by /thresholds'),
  @('parameters', 'string', 'Optional comma-separated parameter filter for /thresholds'),
  @('page', 'number', 'Optional page number for /uqc; defaults to 1'),
  @('limit', 'number', 'Optional page size for /uqc; defaults to 10'),
  @('prefix/count_prefix', 'string', 'Dropdown filtering for count/variety/department/mc endpoints'),
  @('department, department_code', 'string', 'Optional MC number dropdown filters'),
  @('include_all', 'boolean', 'When true, NATI mc-nos includes non-CDG machines')
)

$dbRows = @(
  @('comber.ribbon_lap_cv_qc', 'Lap/Ribbon Lap CV QC header records'),
  @('comber.ribbon_lap_samples', 'Lap/Ribbon Lap CV sample values'),
  @('comber.nati_data_entry', 'NATI header records'),
  @('comber.neps_details', 'NATI child neps details'),
  @('comber.u_data_entry', 'UQC records'),
  @('ticketing_system.threshold_master', 'Threshold rows for /thresholds'),
  @('dbo.Depot_CountMaster', 'SQL Server count-name dropdown source'),
  @('dbo.prepvariety', 'SQL Server Prep variety dropdown source'),
  @('dbo.dept_mai', 'SQL Server department dropdown source'),
  @('dbo.MCMASTER', 'SQL Server MC number dropdown source')
)

$errorRows = @(
  @('400', 'Missing threshold query fields, missing entry_id, missing samples/entries, or missing entry_type/entry_date'),
  @('403', 'SQL Server user does not have SELECT access to prepvariety for NATI varieties'),
  @('409', 'Duplicate entry_id'),
  @('500', 'Unhandled database/server error'),
  @('503', 'SQL Server is not configured on backend for SQL Server-backed dropdowns')
)

$body = ''
$body += Para 'Comber API Documentation' 'Title' -Bold -Color '0B2545' -Size 36
$body += Para 'API reference for Comber backend routes, including Lap CV, NATI Data Entry, UQC, thresholds, and master-data dropdowns.' 'Subtitle' -Color '4B5563' -Size 22
$body += Para 'Overview' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'The Comber API is mounted under /comber. It provides data-entry endpoints, list endpoints, threshold lookup, and SQL Server-backed dropdown/master-data endpoints for Comber screens.'
$body += Bullet 'Base route: /comber'
$body += Bullet 'Content type: application/json'
$body += Bullet 'Server mount: server.js uses app.use("/comber", require("./routes/comber")).'
$body += Bullet 'Entry ID columns and unique indexes are ensured for Lap CV, NATI, and UQC tables.'
$body += Para 'Module Summary' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Module', 'Main Route', 'Purpose') $moduleRows @(2500, 2800, 4060)
$body += Para 'Main Endpoints' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Method', 'Endpoint', 'Purpose') $endpointRows @(900, 3300, 5160)
$body += Para 'Master Data Endpoints' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Method', 'Endpoint', 'Purpose') $masterRows @(900, 4100, 4360)
$body += Para 'Display Entry IDs' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Screen Key', 'Format') $idRows @(4200, 5160)
$body += Para 'Payload Summary' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Module', 'Fields', 'Notes') $payloadRows @(2300, 4300, 2760)
$body += Para 'Common Query Parameters' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Parameter', 'Type', 'Description') $queryRows @(2600, 1600, 5160)
$body += Para 'Request Examples' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'POST /comber/lap-cv { "entry_id": "#CL-0001", "record_date": "2026-06-10", "machine_name": "M1", "variety": "Cotton", "samples": [1.2, 1.3, 1.1] }' 'Code'
$body += Para 'GET /comber/uqc?page=1&limit=10' 'Code'
$body += Para 'Database Tables and Sources' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Table/Source', 'Purpose') $dbRows @(3600, 5760)
$body += Para 'Error Responses' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Status', 'Meaning') $errorRows @(1200, 8160)
$body += Para 'Implementation Notes' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Bullet 'Lap CV and NATI inserts run inside explicit transactions.'
$body += Bullet 'Count dropdowns require SQL Server configuration and read dbo.Depot_CountMaster.'
$body += Bullet 'NATI varieties read the prep database and return a 403 with GRANT guidance when access is denied.'
$body += Bullet 'UQC master dropdown returns shifts, varieties, departments, mc_nos, and options groups.'
$body += Bullet 'NATI mc-nos defaults to CDG machines unless include_all=true is supplied.'
$body += Bullet 'Display entry IDs are generated from screen-specific prefixes when stored entry_id is absent.'

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
  <dc:title>Comber API Documentation</dc:title>
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
