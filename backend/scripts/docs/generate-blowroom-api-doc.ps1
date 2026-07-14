$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$docsApiDir = Join-Path $repoRoot 'docs\api'
$outPath = Join-Path $docsApiDir 'Blowroom API Documentation.docx'
$tmp = Join-Path $repoRoot '__blowroom_api_docx'

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
  @('Sync', 'POST/GET /sync', 'Blowroom sync/openness readings with multiple entry rows'),
  @('Drop Test', 'POST/GET /drop-test', 'Drop test measurements with display and actual weight calculations'),
  @('BR Waste Study', 'POST/GET /br-waste-study', 'Waste study header, type rows, and waste rows'),
  @('Header / Process Parameter', 'POST/GET/PUT /header', 'Blowroom production/process parameter entries')
)

$endpointRows = @(
  @('GET', '/blowroom/thresholds', 'Fetch Blowroom threshold settings'),
  @('POST', '/blowroom/sync', 'Create Blowroom Sync record with child entries'),
  @('GET', '/blowroom/sync', 'List Blowroom Sync records with sync stats'),
  @('POST', '/blowroom/drop-test', 'Create Drop Test entry'),
  @('GET', '/blowroom/drop-test', 'List Drop Test entries with pagination'),
  @('POST', '/blowroom/br-waste-study', 'Create BR Waste Study with type and waste rows'),
  @('GET', '/blowroom/br-waste-study', 'List BR Waste Study records with child rows'),
  @('POST', '/blowroom/header', 'Create Blowroom header/process parameter entry'),
  @('GET', '/blowroom/header', 'List Blowroom header/process parameter entries'),
  @('PUT', '/blowroom/header/:br_id', 'Update existing header entry or create new one when entry_id changes')
)

$masterRows = @(
  @('GET', '/blowroom/master/varieties', 'Prep variety dropdown for Blowroom'),
  @('GET', '/blowroom/master/dropdown', 'Alias for variety dropdown'),
  @('GET', '/blowroom/master/counts', 'Count Name dropdown from SQL Server Depot_CountMaster'),
  @('GET', '/blowroom/master/count-dropdown', 'Count Name alias'),
  @('GET', '/blowroom/master/count-names', 'Count Name alias'),
  @('GET', '/blowroom/master/machines', 'Static Blowroom BR machine dropdown'),
  @('GET', '/blowroom/master/machine-names', 'Machine dropdown alias'),
  @('GET', '/blowroom/master/mc-names', 'Machine dropdown alias'),
  @('GET', '/blowroom/master/mc-nos', 'Machine dropdown alias'),
  @('GET', '/blowroom/master/employees', 'Employee/checked-by dropdown'),
  @('GET', '/blowroom/master/employee-dropdown', 'Employee dropdown alias'),
  @('GET', '/blowroom/master/checked-by', 'Checked-by dropdown alias'),
  @('GET', '/blowroom/header/master/dropdown', 'Header master dropdown with count_name options'),
  @('GET', '/blowroom/{sync|drop-test|br-waste-study}/master/*', 'Notebook-specific aliases for varieties, counts, machines, and employees')
)

$idRows = @(
  @('sync', 'BS-0001', 'Generated display ID when id is available'),
  @('drop_test', 'BD-0001', 'Generated display ID when id is available'),
  @('br_waste_study', 'BW-0001', 'Generated display ID when id is available'),
  @('header', 'PP-0001', 'Process parameter/header display ID from br_id')
)

$syncRows = @(
  @('entry_id', 'string', 'Required and unique'),
  @('inspection_date', 'date/string', 'Inspection date'),
  @('line_no', 'string/number', 'Line number'),
  @('variety', 'string', 'Variety'),
  @('checked_by', 'string', 'Checker/operator name'),
  @('beater', 'string/number', 'Beater value'),
  @('total_time', 'number', 'Total time'),
  @('entries', 'array', 'Rows with value_a, value_b, value_c, sync_percentage')
)

$dropRows = @(
  @('entry_id', 'string', 'Required and unique'),
  @('drop_id/drop_test_id', 'string', 'Parent drop ID; can be inferred from entry_id'),
  @('date', 'date/string', 'Drop test date'),
  @('variety, blend', 'string', 'Variety and blend labels'),
  @('tuft_no, tuft_variety', 'number/string', 'Tuft details'),
  @('display_weight, actual_weight', 'number', 'Used to calculate difference when omitted'),
  @('difference', 'number', 'Defaults to actual_weight - display_weight'),
  @('ratio_percent', 'number', 'Defaults to difference/display_weight percent')
)

$wasteRows = @(
  @('entry_id or waste_study_id', 'string', 'Required and unique'),
  @('date/entry_date/inspection_date', 'date/string', 'Required date'),
  @('study_type', 'string', 'Required: Type 1, Type 2, or Type 3'),
  @('carding_production_kg', 'number', 'Production value for percent calculations'),
  @('type_rows/type_entries', 'array', 'Machine/speed/detail rows'),
  @('waste_rows', 'array', 'Waste type and waste kg/percent rows'),
  @('waste_kg, waste_percent, overall_percent', 'number', 'Computed from rows/production when omitted'),
  @('remarks', 'string', 'Optional remarks')
)

$headerRows = @(
  @('entry_id', 'string', 'Required and unique on create'),
  @('count_name', 'string', 'Required on update; count name'),
  @('consignee_name', 'string', 'Required on update; consignee'),
  @('creation_date', 'date/string', 'Required on update; creation date'),
  @('line_numbers', 'number', 'Line numbers'),
  @('rotary_beater_speed, depth', 'number', 'Process parameters'),
  @('mpm_delivery_speed, mpm_delivery_pascals', 'number', 'Process parameters'),
  @('condensor_speed, rk_feed_roll_beater, rk_beater_speed', 'number', 'Process parameters'),
  @('flexi_to_feed_roll_beater, flexi_beater_speed', 'number', 'Process parameters'),
  @('scutcher_no, rk_mo_speed, kb_speed, grid_bar', 'number', 'Process parameters'),
  @('lap_weight, uniclean, srs, rk_flexi', 'number', 'Process parameters')
)

$queryRows = @(
  @('page', 'number', 'Optional page number for paginated list APIs; defaults to 1'),
  @('limit', 'number', 'Optional page size for paginated list APIs; defaults to 10'),
  @('prefix', 'string', 'Dropdown filter for counts or machines'),
  @('count_prefix', 'string', 'Count Name dropdown filter'),
  @('machine_prefix or q', 'string', 'Machine dropdown filter')
)

$dbRows = @(
  @('blowroom.blow_room_sync', 'Sync header records'),
  @('blowroom.blow_room_sync_entries', 'Sync child entry rows'),
  @('blowroom.sync_stats', 'Derived sync statistics view/table used by GET /sync'),
  @('blowroom.drop_test', 'Drop Test records'),
  @('blowroom.br_waste_study', 'BR Waste Study header records'),
  @('blowroom.br_waste_study_type_rows', 'BR Waste Study type/machine rows'),
  @('blowroom.br_waste_study_waste_rows', 'BR Waste Study waste rows'),
  @('blowroom.blowroom_header', 'Header/process parameter records'),
  @('ticketing_system.threshold_master', 'Threshold rows for /thresholds'),
  @('dbo.Depot_CountMaster', 'SQL Server count-name dropdown source')
)

$errorRows = @(
  @('400', 'Missing entry_id, drop_id, date/study_type, invalid ID, or missing required update fields'),
  @('409', 'Duplicate entry_id or duplicate waste study ID'),
  @('404', 'Header entry not found'),
  @('500', 'Unhandled database/server error'),
  @('503', 'SQL Server is not configured on backend for count dropdown endpoints')
)

$body = ''
$body += Para 'Blowroom API Documentation' 'Title' -Bold -Color '0B2545' -Size 36
$body += Para 'API reference for Blowroom backend routes, including Sync, Drop Test, BR Waste Study, Header/Process Parameter, thresholds, and master-data dropdowns.' 'Subtitle' -Color '4B5563' -Size 22
$body += Para 'Overview' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'The Blowroom API is mounted under /blowroom. It provides data-entry endpoints, paginated list endpoints, threshold lookup, and dropdown/master-data endpoints for Blowroom screens.'
$body += Bullet 'Base route: /blowroom'
$body += Bullet 'Content type: application/json'
$body += Bullet 'Server mount: server.js uses app.use("/blowroom", require("./routes/blowroom")).'
$body += Bullet 'Some helper functions create missing entry_id columns, unique indexes, and BR Waste Study child tables when routes are used.'
$body += Para 'Module Summary' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Module', 'Main Route', 'Purpose') $moduleRows @(2200, 2600, 4560)
$body += Para 'Main Endpoints' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Method', 'Endpoint', 'Purpose') $endpointRows @(900, 3300, 5160)
$body += Para 'Master Data Endpoints' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Method', 'Endpoint', 'Purpose') $masterRows @(900, 4100, 4360)
$body += Para 'Display Entry IDs' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Screen Key', 'Format', 'Notes') $idRows @(2200, 1800, 5360)
$body += Para 'Sync Payload Fields' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Field', 'Type', 'Description') $syncRows @(2600, 1700, 5060)
$body += Para 'Drop Test Payload Fields' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Field', 'Type', 'Description') $dropRows @(2600, 1700, 5060)
$body += Para 'BR Waste Study Payload Fields' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Field', 'Type', 'Description') $wasteRows @(2700, 1600, 5060)
$body += Para 'Header / Process Parameter Fields' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Field', 'Type', 'Description') $headerRows @(3300, 1300, 4760)
$body += Para 'Common Query Parameters' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Parameter', 'Type', 'Description') $queryRows @(2300, 1600, 5460)
$body += Para 'Request Examples' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'POST /blowroom/sync { "entry_id": "BS-0001", "inspection_date": "2026-06-10", "line_no": "1", "variety": "Cotton", "checked_by": "EMP001", "beater": "B1", "total_time": 120, "entries": [{ "value_a": 10, "value_b": 20, "value_c": 30, "sync_percentage": 90 }] }' 'Code'
$body += Para 'GET /blowroom/drop-test?page=1&limit=10' 'Code'
$body += Para 'Database Tables and Sources' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Table/Source', 'Purpose') $dbRows @(3600, 5760)
$body += Para 'Error Responses' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Status', 'Meaning') $errorRows @(1200, 8160)
$body += Para 'Implementation Notes' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Bullet 'Blowroom BR machine dropdown values are static in routes/blowroom.js.'
$body += Bullet 'Count Name dropdowns require SQL Server configuration and read dbo.Depot_CountMaster.'
$body += Bullet 'Variety dropdowns use sendPrepVarietyDropdown(sqlServerPrep, "blowroom").'
$body += Bullet 'Employee/checked-by dropdowns use createEmployeeMasterDropdown().'
$body += Bullet 'Drop Test calculates difference and ratio_percent when omitted.'
$body += Bullet 'BR Waste Study calculates waste_kg, waste_percent, and overall_percent when enough source values are supplied.'
$body += Bullet 'PUT /header/:br_id may create a new record with status 201 when a different entry_id is supplied.'

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
  <dc:title>Blowroom API Documentation</dc:title>
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
