$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$docsApiDir = Join-Path $repoRoot 'docs\api'
$outPath = Join-Path $docsApiDir 'Simplex API Documentation.docx'
$tmp = Join-Path $repoRoot '__simplex_api_docx'

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
  @('Wrapping Simplex Notebook', 'POST/GET /wrapping-simplex-notebook', 'Create and list wrapping notebook rows'),
  @('Thresholds', 'GET /thresholds', 'Fetch active ticket threshold values for a machine/product/field'),
  @('Master Data', 'GET /master-data and aliases', 'SQL Server dropdowns for variety, department, machine, count, employees'),
  @('SMX Cots Change', 'POST/GET /SMXCotsChange', 'Create and list Simplex cots change inspections'),
  @('SMX Breaks Study', 'POST /study, GET /list', 'Create study report and list study headers'),
  @('UQC', 'POST/GET /uqc, GET /uqc/global', 'Create and list Simplex UQC entries'),
  @('Process Parameter', 'POST/GET/PUT /process_parameter', 'Create, list, and update process parameter entries')
)

$endpointRows = @(
  @('POST', '/simplex/wrapping-simplex-notebook', 'Create one or more wrapping simplex notebook rows'),
  @('GET', '/simplex/wrapping-simplex-notebook', 'List wrapping simplex notebook rows'),
  @('GET', '/simplex/thresholds', 'Fetch active thresholds'),
  @('POST', '/simplex/SMXCotsChange', 'Create Simplex cots change inspection'),
  @('GET', '/simplex/SMXCotsChange', 'List Simplex cots change inspections'),
  @('GET', '/simplex/study/machine-names', 'Get Simplex machine names for study form'),
  @('POST', '/simplex/study', 'Create SMX Breaks Study Report'),
  @('GET', '/simplex/list', 'List SMX Breaks Study headers'),
  @('POST', '/simplex/uqc', 'Create UQC entry'),
  @('GET', '/simplex/uqc', 'List UQC entries with pagination and optional department filter'),
  @('GET', '/simplex/uqc/global', 'List UQC entries in global mode'),
  @('POST', '/simplex/process_parameter', 'Create Simplex Process Parameter entry'),
  @('GET', '/simplex/process_parameter', 'List Simplex Process Parameter entries'),
  @('PUT', '/simplex/process_parameter/:id', 'Update Simplex Process Parameter entry')
)

$aliasRows = @(
  @('Wrapping notebook', '/wrapping/simplex-notebook, /simplex-notebook/wrapping'),
  @('SMX Cots Change', '/smx-cots-change, /smx-cotschange, /cots-change, /cots-change-data-entry'),
  @('Study machine names', '/study/master/machine-names'),
  @('Process parameter master', '/process-parameter/master-data and /process-parameter/master/* aliases'),
  @('UQC master', '/uqc/master-data, /uqc/master/dropdown, /uqc/master/* aliases')
)

$masterRows = @(
  @('GET', '/simplex/master-data', 'Combined Simplex dropdown data'),
  @('GET', '/simplex/master/dropdown', 'Combined Simplex dropdown data'),
  @('GET', '/simplex/master/varieties', 'Variety dropdown only'),
  @('GET', '/simplex/master/departments', 'Department dropdown only'),
  @('GET', '/simplex/master/mc-nos', 'Machine number dropdown only'),
  @('GET', '/simplex/master/counts', 'Count Name dropdown only'),
  @('GET', '/simplex/master/employees', 'Employee/operator dropdown'),
  @('GET', '/simplex/uqc/master-data', 'UQC dropdown master data'),
  @('GET', '/simplex/process_parameter/master-data', 'Process Parameter Count Name dropdown'),
  @('GET', '/simplex/study/master-data', 'Study dropdown master data'),
  @('GET', '/simplex/SMXCotsChange/master-data', 'Cots Change dropdown master data')
)

$fieldRows = @(
  @('entry_id', 'string', 'Required for create routes; must be unique'),
  @('page', 'number', 'Optional page number for list APIs'),
  @('limit', 'number/string', 'Optional page size; UQC accepts limit=all'),
  @('department', 'string', 'Optional UQC filter unless global mode is enabled'),
  @('prefix / count_prefix', 'string', 'Optional dropdown filtering token'),
  @('management_field, erp_product_code, machine_name', 'string', 'Required query fields for /thresholds')
)

$payloadRows = @(
  @('Wrapping Notebook', 'entry_id, serial_no, date/date_text, mac_name, shift, std_hank, avg_hank, sd, cv, user_name, remark'),
  @('SMX Cots Change', 'entry_id, type, s_no, entry_date, machine_name, items[]'),
  @('Study', 'entry_id, s_no, entry_date, machine_name, operator_name, shift, inspection_items, user_fiber_parameters, epi_parameters, other_field_values'),
  @('UQC', 'entry_id, entry_type, entry_date, shift, variety, department, mc_no, u_percent, cvm, cvm_1m, cvm_3m, remarks'),
  @('Process Parameter', 'entry_id, count_name, consignee_name, creation_date, machine_no, make, delivery_hank, tpi_tm, speed, roller settings, drafts, pressure fields, wheels')
)

$idRows = @(
  @('smx_cots_change', '#SX-0001', 'simplex.simplex_inspections.id'),
  @('study', '#SS-0001', 'simplex.smx_breaks_study_header.id'),
  @('uqc', '#SU-0001', 'simplex.u_data_entry.id'),
  @('process_parameter', '#SP-0001', 'simplex.simplex_process_parameter.id'),
  @('wrapping_simplex_notebook', '#WS-0001', 'wrapping.simplex_notebook.id')
)

$dbRows = @(
  @('wrapping.simplex_notebook', 'Wrapping simplex notebook rows'),
  @('simplex.simplex_inspections', 'SMX Cots Change inspection headers'),
  @('simplex.simplex_inspection_details', 'SMX Cots Change detail items'),
  @('simplex.smx_breaks_study_header', 'SMX Breaks Study headers'),
  @('simplex.smx_breaks_inspection_items', 'Study inspection and derived rows'),
  @('simplex.smx_user_fiber_parameters', 'Study user fiber values'),
  @('simplex.smx_epi_parameters', 'Study EPI values'),
  @('simplex.smx_other_field_values', 'Study other field values'),
  @('simplex.u_data_entry', 'UQC entries'),
  @('simplex.simplex_process_parameter', 'Process Parameter entries'),
  @('ticketing_system.threshold_master', 'Threshold lookups')
)

$errorRows = @(
  @('400', 'Missing required fields such as entry_id, required study fields, threshold query fields, or process fields'),
  @('403', 'SQL Server prep variety table access denied for master data'),
  @('409', 'Duplicate entry_id on unique-entry create routes'),
  @('503', 'SQL Server is not configured for SQL Server-backed master data'),
  @('500', 'Unhandled database/server error')
)

$body = ''
$body += Para 'Simplex API Documentation' 'Title' -Bold -Color '0B2545' -Size 36
$body += Para 'API reference for routes/simplex.js, including wrapping notebook, thresholds, master-data dropdowns, SMX Cots Change, SMX Breaks Study, UQC, and Process Parameter routes.' 'Subtitle' -Color '4B5563' -Size 22
$body += Para 'Overview' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'The Simplex API is mounted under /simplex. It provides Simplex data-entry screens, paginated list APIs, SQL Server-backed dropdowns, threshold lookups, and compatibility aliases used by existing frontend screens.'
$body += Bullet 'Base route: /simplex'
$body += Bullet 'Content type: application/json'
$body += Bullet 'Server mount: server.js uses app.use("/simplex", require("./routes/simplex")).'
$body += Bullet 'Create routes use entry_id as a required unique display identifier.'
$body += Para 'Module Summary' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Module', 'Main Route', 'Purpose') $moduleRows @(2400, 3000, 3960)
$body += Para 'Main Endpoints' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Method', 'Endpoint', 'Purpose') $endpointRows @(900, 3500, 4960)
$body += Para 'Compatibility Aliases' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Area', 'Aliases') $aliasRows @(2300, 7060)
$body += Para 'Master Data Endpoints' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'Use these endpoints to populate dropdowns for Simplex forms. Combined responses include options.shift, options.variety, options.department, and options.mc_no where available.'
$body += Table @('Method', 'Endpoint', 'Purpose') $masterRows @(900, 3900, 4560)
$body += Para 'Common Query and Payload Fields' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Field', 'Type', 'Description') $fieldRows @(3000, 1800, 4560)
$body += Para 'Screen Payload Summary' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Screen', 'Main Fields') $payloadRows @(2300, 7060)
$body += Para 'Entry ID Formats' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Screen Key', 'Format', 'Source ID') $idRows @(2600, 1800, 4960)
$body += Para 'Request Examples' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'GET /simplex/master-data?prefix=SMX' 'Code'
$body += Para 'GET /simplex/thresholds?management_field=Simplex&erp_product_code=40s&machine_name=SMX%2001&parameters=TOTAL%20SPDL' 'Code'
$body += Para 'POST /simplex/process_parameter' 'Code'
$body += Para '{ "entry_id": "#SP-0001", "count_name": "40s Carded", "consignee_name": "ABC Mills", "creation_date": "2026-06-10", "machine_no": "SMX 01" }' 'Code'
$body += Para 'Database Tables' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Table', 'Usage') $dbRows @(3300, 6060)
$body += Para 'Error Responses' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Status', 'Meaning') $errorRows @(1200, 8160)
$body += Para 'Implementation Notes' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Bullet 'formatScreenEntryId maps stored numeric IDs to display IDs using SX, SS, SU, SP, and WS prefixes.'
$body += Bullet 'ensureSimplexEntryIdColumns adds entry_id columns and unique indexes for Simplex create screens when needed.'
$body += Bullet 'Study creation calculates derived rows such as total time, running spindles, total breaks, and overall breakage percent.'
$body += Bullet 'UQC list supports department filtering and global mode via /uqc/global or global=true.'
$body += Bullet 'Master data uses SQL Server for varieties, departments, machine numbers, counts, and employees.'

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
  <dc:title>Simplex API Documentation</dc:title>
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
