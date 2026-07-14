$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$docsApiDir = Join-Path $repoRoot 'docs\api'
$outPath = Join-Path $docsApiDir 'Autoconer API Documentation.docx'
$tmp = Join-Path $repoRoot '__autoconer_api_docx'

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

$endpointRows = @(
  @('GET', '/autoconer/thresholds', 'Fetch Autoconer threshold settings'),
  @('POST', '/autoconer/lycra-checking', 'Create Lycra Checking inspection with readings and summary'),
  @('GET', '/autoconer/lycra-checking', 'List Lycra Checking records'),
  @('POST', '/autoconer/count-wise-cuts', 'Create Count Wise Cuts record'),
  @('GET', '/autoconer/count-wise-cuts', 'List Count Wise Cuts records'),
  @('POST', '/autoconer/drum-wise', 'Create Drum Wise inspection'),
  @('GET', '/autoconer/drum-wise', 'List Drum Wise inspections with pagination'),
  @('POST', '/autoconer/splice-strength', 'Create Splice Strength inspection with drum readings'),
  @('GET', '/autoconer/splice-strength', 'List Splice Strength inspections with pagination'),
  @('POST', '/autoconer/inspection-data-entry', 'Create Inspection Data Entry with readings'),
  @('GET', '/autoconer/inspection-data-entry', 'List Inspection Data Entry records with pagination'),
  @('POST', '/autoconer/cone-density', 'Create Cone Density record with readings'),
  @('GET', '/autoconer/cone-density', 'List Cone Density records with pagination'),
  @('POST', '/autoconer/cone-packing-audit', 'Create Cone Packing Audit'),
  @('GET', '/autoconer/cone-packing-audit', 'List Cone Packing Audits with pagination'),
  @('POST', '/autoconer/parameter-entries', 'Create CSP or Quality parameter entry'),
  @('PUT', '/autoconer/parameter-entries/:id', 'Update parameter entry'),
  @('GET', '/autoconer/parameter-entries', 'List parameter entries'),
  @('GET', '/autoconer/parameter-entries/pending-csp', 'List entries pending for CSP'),
  @('GET', '/autoconer/parameter-entries/pending-quality', 'List entries pending for Quality'),
  @('POST', '/autoconer/process', 'Create Autoconer Process Parameter entry'),
  @('GET', '/autoconer/process', 'List Autoconer Process Parameter entries'),
  @('PUT', '/autoconer/process/:id', 'Update Autoconer Process Parameter entry'),
  @('POST', '/autoconer/q2', 'Create Autoconer Q2 Inspection entry'),
  @('GET', '/autoconer/q2', 'List Autoconer Q2 Inspection entries'),
  @('PUT', '/autoconer/q2/:id', 'Update Autoconer Q2 Inspection entry'),
  @('POST', '/autoconer/q3', 'Create Autoconer Q3 entry'),
  @('GET', '/autoconer/q3', 'List Autoconer Q3 entries'),
  @('PUT', '/autoconer/q3/:id', 'Update Autoconer Q3 entry')
)

$masterRows = @(
  @('GET', '/autoconer/master-data', 'Shared master data: count names, Autoconer machine numbers, consignee names'),
  @('GET', '/autoconer/master/dropdown', 'Alias for shared master data'),
  @('GET', '/autoconer/master/counts', 'Count Name dropdown only'),
  @('GET', '/autoconer/master/count-dropdown', 'Count Name dropdown only'),
  @('GET', '/autoconer/master/count-names', 'Count Name dropdown only'),
  @('GET', '/autoconer/count-master', 'Count Name dropdown only'),
  @('GET', '/autoconer/master/machines', 'Autoconer machine dropdown only'),
  @('GET', '/autoconer/master/machine-names', 'Autoconer machine dropdown only'),
  @('GET', '/autoconer/master/mc-names', 'Autoconer machine dropdown only'),
  @('GET', '/autoconer/master/mc-nos', 'Autoconer machine dropdown only'),
  @('GET', '/autoconer/master/autoconer-nos', 'Autoconer machine dropdown only'),
  @('GET', '/autoconer/master/employees', 'Employee/operator dropdown'),
  @('GET', '/autoconer/master/operator-names', 'Employee/operator dropdown'),
  @('GET', '/autoconer/master/consignees', 'Consignee dropdown only'),
  @('GET', '/autoconer/master/consignee-names', 'Consignee dropdown only'),
  @('GET', '/autoconer/master/consignee-dropdown', 'Consignee dropdown only')
)

$screenMasterRows = @(
  @('GET', '/autoconer/process-parameter/master-data', 'Process Parameter dropdown master data'),
  @('GET', '/autoconer/process_parameter/master-data', 'Process Parameter alias'),
  @('GET', '/autoconer/q2/master-data', 'Q2 dropdown master data'),
  @('GET', '/autoconer/q3/master-data', 'Q3 dropdown master data'),
  @('GET', '/autoconer/inspection-data-entry/master-data', 'Inspection Data Entry dropdown master data'),
  @('GET', '/autoconer/cone-density/master-data', 'Cone Density dropdown master data'),
  @('GET', '/autoconer/conedensity/master-data', 'Cone Density alias'),
  @('GET', '/autoconer/splice-strength/master-data', 'Splice Strength dropdown master data'),
  @('GET', '/autoconer/drum-wise/master-data', 'Drum Wise dropdown master data'),
  @('GET', '/autoconer/count-wise-cuts/master-data', 'Count Wise Cuts dropdown master data'),
  @('GET', '/autoconer/lycra-checking/master-data', 'Lycra Checking dropdown master data'),
  @('GET', '/autoconer/cone-packing-audit/master-data', 'Cone Packing Audit dropdown master data')
)

$fieldRows = @(
  @('source', 'string', 'sqlserver or postgres, depending on backend database configuration'),
  @('count_options', 'array', 'Raw count master records with cntcode and cntname'),
  @('consignee_options', 'array', 'Consignee dropdown objects from existing Autoconer records'),
  @('count_names', 'array<string>', 'Flat list of count names'),
  @('consignee_names', 'array<string>', 'Flat list of consignee names'),
  @('options.count_name', 'array<object>', 'Preferred frontend binding for Count Name dropdown'),
  @('options.consignee_name', 'array<object>', 'Preferred frontend binding for Consignee Name dropdown')
)

$sourceRows = @(
  @('Count Name', 'SQL Server', 'dbo.Depot_CountMaster; filtered with count_prefix or prefix when supplied'),
  @('Count Name fallback', 'PostgreSQL', 'Distinct count_name from autoconer.autoconer_process_parameter and autoconer.cone_density'),
  @('Consignee Name', 'PostgreSQL', 'Distinct consignee_name from autoconer_process_parameter, autoconer_q2_inspection, and autoconer_q3_inspection')
)

$moduleRows = @(
  @('Lycra Checking', 'POST/GET /lycra-checking', 'Header, reading rows, summary values'),
  @('Count Wise Cuts', 'POST/GET /count-wise-cuts', 'Count-wise cut record values'),
  @('Drum Wise', 'POST/GET /drum-wise', 'Machine/count level inspection data and drum readings'),
  @('Splice Strength', 'POST/GET /splice-strength', 'Inspection header and drum strength readings'),
  @('Inspection Data Entry', 'POST/GET /inspection-data-entry', 'Header, machine/count data, and drum reading rows'),
  @('Cone Density', 'POST/GET /cone-density', 'Cone density header and reading rows'),
  @('Cone Packing Audit', 'POST/GET /cone-packing-audit', 'Audit header, drum entries, yarn readings'),
  @('Parameter Entries', 'POST/PUT/GET /parameter-entries', 'CSP and Quality workflow entries'),
  @('Process Parameter', 'POST/GET/PUT /process', 'Autoconer process parameter entry'),
  @('Q2 Inspection', 'POST/GET/PUT /q2', 'Autoconer Q2 inspection entry'),
  @('Q3 Inspection', 'POST/GET/PUT /q3', 'Autoconer Q3 inspection entry')
)

$commonQueryRows = @(
  @('page', 'number', 'Optional page number for paginated list APIs'),
  @('limit', 'number', 'Optional page size for paginated list APIs'),
  @('count_prefix or prefix', 'string', 'Optional Count Name filter for master-data APIs'),
  @('screen-specific filters', 'string/date', 'Some list routes support filter parameters based on stored columns')
)

$processRows = @(
  @('count_name', 'string', 'Required for Process, Q2, and Q3 create/update payloads'),
  @('consignee_name', 'string', 'Required for Process, Q2, and Q3 create/update payloads'),
  @('creation_date', 'date/string', 'Required for Process, Q2, and Q3 create/update payloads'),
  @('machine_no', 'string', 'Autoconer machine number where applicable'),
  @('entry_id', 'string', 'Generated/display identifier such as #AP-0001, #A2-0001, or #A3-0001'),
  @('type', 'string', 'Defaults to Process Parameter or the screen-specific type when omitted')
)

$body = ''
$body += Para 'Autoconer API Documentation' 'Title' -Bold -Color '0B2545' -Size 36
$body += Para 'API reference for the Autoconer backend routes, including data-entry APIs, list APIs, master-data dropdowns, Process Parameter, Q2, and Q3.' 'Subtitle' -Color '4B5563' -Size 22
$body += Para 'Overview' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'The Autoconer API is mounted under /autoconer. It provides form submission endpoints, paginated/list endpoints, workflow endpoints, and shared master-data dropdown endpoints. Process Parameter, Q2, and Q3 use the same master-data method for Count Name and Consignee Name dropdowns.'
$body += Bullet 'Base route: /autoconer'
$body += Bullet 'Authentication: follows the existing backend route configuration for this API group.'
$body += Bullet 'Content type: application/json'
$body += Bullet 'Server mount: server.js uses app.use("/autoconer", require("./routes/autoconer")).'
$body += Para 'Module Summary' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Module', 'Main Route', 'Purpose') $moduleRows @(2200, 2600, 4560)
$body += Para 'Main Endpoints' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Method', 'Endpoint', 'Purpose') $endpointRows @(900, 3200, 5260)
$body += Para 'Master Data Endpoints' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'Use these endpoints to populate dropdowns. The shared response includes Count Name, Autoconer machine number, and Consignee Name where available.'
$body += Table @('Method', 'Endpoint', 'Purpose') $masterRows @(900, 3500, 4960)
$body += Para 'Screen-Specific Master Data' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Method', 'Endpoint', 'Purpose') $screenMasterRows @(900, 3900, 4560)
$body += Para 'Dropdown Binding' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'After calling any master-data endpoint, use these response paths in the form dropdowns:'
$body += Bullet 'Count Name dropdown: response.options.count_name'
$body += Bullet 'Consignee Name dropdown: response.options.consignee_name'
$body += Bullet 'Autoconer machine dropdown: response.options.autoconer_no or response.autoconer_options'
$body += Para 'Request Example' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'GET /autoconer/q2/master-data?count_prefix=40' 'Code'
$body += Para 'Response Shape' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Field', 'Type', 'Description') $fieldRows @(2500, 1800, 5060)
$body += Para 'Sample Response' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para '{ "source": "sqlserver", "count_names": ["40s Carded"], "consignee_names": ["ABC Mills"], "options": { "count_name": [{ "text": "40s Carded", "label": "40s Carded", "value": "40s Carded", "cntcode": "1001" }], "consignee_name": [{ "value": "ABC Mills", "label": "ABC Mills", "text": "ABC Mills", "consignee_name": "ABC Mills" }] } }' 'Code'
$body += Para 'Data Source Details' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Dropdown', 'Source', 'Details') $sourceRows @(1900, 1900, 5560)
$body += Para 'Common Query Parameters' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Parameter', 'Type', 'Description') $commonQueryRows @(2200, 1600, 5560)
$body += Para 'Process, Q2, and Q3 Common Fields' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Field', 'Type', 'Description') $processRows @(2200, 1700, 5460)
$body += Para 'Error Responses' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Bullet '500 Server error: returned when the master-data query fails.'
$body += Bullet '503 SQL Server is not configured on backend: returned by the count-only endpoints when SQL Server environment variables are unavailable.'
$body += Bullet '400 validation errors: returned by create/update routes when required fields such as count_name, consignee_name, or creation_date are missing.'
$body += Bullet '404 not found: returned by update routes when the target record ID does not exist.'
$body += Para 'Implementation Notes' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Bullet 'The shared method is implemented in routes/autoconer.js as fetchAutoconerMasterData(query).'
$body += Bullet 'Process Parameter, Q2, and Q3 endpoints all call the same shared method, so their Count Name and Consignee Name dropdown behavior stays consistent.'
$body += Bullet 'Consignee names are collected from existing Autoconer Process Parameter, Q2, and Q3 records so newly saved consignees become available in later dropdown loads.'
$body += Bullet 'Count names prefer SQL Server dbo.Depot_CountMaster when SQL Server environment variables are configured; otherwise the fallback reads distinct saved values from PostgreSQL.'
$body += Bullet 'Machine numbers prefer SQL Server MCMASTER joined with department master for Autoconer/Autocone department names.'

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
  <w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
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
  <dc:title>Autoconer API Documentation</dc:title>
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
