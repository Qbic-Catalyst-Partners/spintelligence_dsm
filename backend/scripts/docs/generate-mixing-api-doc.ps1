$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$docsApiDir = Join-Path $repoRoot 'docs\api'
$outPath = Join-Path $docsApiDir 'Mixing API Documentation.docx'
$tmp = Join-Path $repoRoot '__mixing_api_docx'

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
  @('Cotton HVI', 'POST/GET /cotton-hvi', 'Cotton HVI inspection values and threshold ticket creation'),
  @('Fibre', 'POST/GET /fibre', 'Fibre receipt quality values'),
  @('AFIS', 'POST/GET /afis', 'AFIS fibre property values'),
  @('Moisture', 'POST/GET /moisture', 'Moisture readings and average'),
  @('Openness', 'POST/GET /openness', 'Openness inspection header, entries, stage stats, and overall stats'),
  @('Mixing QC', 'POST/GET/PUT /qc', 'Mixing QC header and blend rows')
)

$endpointRows = @(
  @('GET', '/mixing/cotton-hvi/thresholds', 'Fetch fixed Cotton HVI threshold fields'),
  @('GET', '/mixing/thresholds', 'Fetch generic active thresholds for a machine/screen'),
  @('POST', '/mixing/cotton-hvi', 'Create Cotton HVI data entry'),
  @('GET', '/mixing/cotton-hvi', 'List Cotton HVI entries with pagination'),
  @('POST', '/mixing/fibre', 'Create Fibre data entry'),
  @('GET', '/mixing/fibre', 'List Fibre entries with pagination'),
  @('POST', '/mixing/afis', 'Create AFIS data entry'),
  @('GET', '/mixing/afis', 'List AFIS entries with pagination'),
  @('POST', '/mixing/moisture', 'Create Moisture data entry'),
  @('GET', '/mixing/moisture', 'List Moisture entries with pagination'),
  @('POST', '/mixing/openness', 'Create Openness inspection with entries'),
  @('GET', '/mixing/openness', 'List Openness inspections with entries and stats'),
  @('POST', '/mixing/qc', 'Create Mixing QC header with blend rows'),
  @('GET', '/mixing/qc', 'List Mixing QC entries with blends'),
  @('PUT', '/mixing/qc/:qc_id', 'Update Mixing QC header and replace blend rows')
)

$masterRows = @(
  @('GET', '/mixing/master/varieties', 'Variety dropdown from SQL Server dbo.VARIETY'),
  @('GET', '/mixing/master/dropdown', 'Alias for variety dropdown'),
  @('GET', '/mixing/master/counts', 'Count Name dropdown from SQL Server dbo.Depot_CountMaster'),
  @('GET', '/mixing/master/employees', 'Employee/user dropdown for Mixing'),
  @('GET', '/mixing/cotton-hvi/master/dropdown', 'Cotton HVI master data'),
  @('GET', '/mixing/cotton-hvi/master/lots', 'Cotton lot dropdown from lotmaster'),
  @('GET', '/mixing/fibre/master/dropdown', 'Fibre/PSF receipt master data'),
  @('GET', '/mixing/fibre/master/lots', 'PSF receipt lot dropdown'),
  @('GET', '/mixing/mmf-hvi/master/dropdown', 'MMF HVI alias for Fibre/PSF receipt master data'),
  @('GET', '/mixing/moisture/master/lots', 'Moisture lot dropdown from lotmaster'),
  @('GET', '/mixing/{afis|moisture|openness}/master/dropdown', 'Notebook-specific variety dropdown aliases'),
  @('GET', '/mixing/qc/master/dropdown', 'Mixing QC combined count and employee dropdowns')
)

$idRows = @(
  @('cotton_hvi', '#CH-0001', 'Cotton HVI entries'),
  @('fibre', '#FB-0001', 'Fibre entries'),
  @('afis', '#AF-0001', 'AFIS entries'),
  @('moisture', '#MO-0001', 'Moisture entries'),
  @('openness', '#OP-0001', 'Openness inspections'),
  @('qc', '#MQ-0001', 'Mixing QC entries')
)

$payloadRows = @(
  @('Cotton HVI', 'entry_id, inspection_date, lot_no, variety, invoice_no, invoice_date, sci, span_length, mic, gtex, maturity, ur, sfi, elongation, yellow_b, trcnt, trar, trid, trash_content_percentage, invisible_loss_percentage, rd, colour_grade'),
  @('Fibre', 'inspection_date, lot_no, variety, invoice_no, invoice_date, cut_length, length_cv, mean_denier, cv_per_denier, tenacity, cv_per_tenacity, elongation, cv_per_elongation, crimp, whiteness_index, spin_finish'),
  @('AFIS', 'inspection_date, lot_no, variety, invoice_no, invoice_date, uql, l5, sfc_n, ifc, fibre_neps_gms, sfc_w, maturity, fineness, scn_gms'),
  @('Moisture', 'inspection_date, party_lot_no, variety, party_name, pr_no, value1 through value10, average'),
  @('Openness', 'inspection_date, mixing, actual_specific_volume_target, no_of_entries, entries[] with machine_name, weight, volume_1, volume_2, apparent_specific_volume, actual_op_value'),
  @('Mixing QC', 'consignee_name, count_name, creation_date, status, blends[] with blend_no, percentage, lot_no, cut_length, tenacity, elongation, merge_no')
)

$queryRows = @(
  @('page', 'number', 'Optional page number for paginated list APIs; defaults to 1'),
  @('limit', 'number', 'Optional page size for paginated list APIs; defaults to 10'),
  @('prefix', 'string', 'Shared dropdown search prefix'),
  @('variety_prefix', 'string', 'Variety dropdown filter'),
  @('count_prefix', 'string', 'Count Name dropdown filter'),
  @('lot_prefix', 'string', 'Lot dropdown filter'),
  @('lot_no', 'string', 'Exact lot lookup on lot dropdown APIs where supported'),
  @('management_field, erp_product_code, machine_name', 'string', 'Required by generic /thresholds'),
  @('parameters', 'comma-separated string', 'Optional generic threshold parameter names')
)

$dbRows = @(
  @('mixing.cotton_hvi_data_entry', 'Cotton HVI records'),
  @('mixing.fibre_data_entry', 'Fibre records'),
  @('mixing.afis_data_entry', 'AFIS records'),
  @('mixing.moisture_data_entry', 'Moisture records'),
  @('mixing.openness_inspection', 'Openness inspection header records'),
  @('mixing.openness_entries', 'Openness child entry rows'),
  @('mixing.openness_stage_stats', 'Openness stage statistics'),
  @('mixing.openness_overall_stats', 'Openness overall statistics'),
  @('mixing.mixing_qc_header', 'Mixing QC header records'),
  @('mixing.mixing_qc_blends', 'Mixing QC blend rows'),
  @('ticketing_system.threshold_master', 'Threshold lookup rows'),
  @('SQL Server VARIETY, Depot_CountMaster, lotmaster, PSF_Receipt', 'Master data dropdown sources')
)

$errorRows = @(
  @('400', 'Missing entry_id, invalid Cotton HVI numeric values, missing Openness entries, or missing threshold query fields'),
  @('409', 'Duplicate entry_id on unique-entry screens such as Cotton HVI'),
  @('500', 'Unhandled database/server error'),
  @('503', 'SQL Server is not configured for SQL Server-backed dropdown endpoints')
)

$body = ''
$body += Para 'Mixing API Documentation' 'Title' -Bold -Color '0B2545' -Size 36
$body += Para 'API reference for Mixing backend routes, including Cotton HVI, Fibre, AFIS, Moisture, Openness, Mixing QC, thresholds, and master-data dropdowns.' 'Subtitle' -Color '4B5563' -Size 22
$body += Para 'Overview' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'The Mixing API is mounted under /mixing. It provides data-entry endpoints, paginated list endpoints, threshold lookup, SQL Server-backed master data, and QC blend management.'
$body += Bullet 'Base route: /mixing'
$body += Bullet 'Content type: application/json for create/update requests.'
$body += Bullet 'Server mount: server.js uses app.use("/mixing", require("./routes/mixing")).'
$body += Bullet 'Some save routes use threshold values to auto-create tickets when measured values cross configured limits.'
$body += Para 'Module Summary' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Module', 'Main Route', 'Purpose') $moduleRows @(2200, 2500, 4660)
$body += Para 'Main Endpoints' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Method', 'Endpoint', 'Purpose') $endpointRows @(900, 3300, 5160)
$body += Para 'Master Data Endpoints' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Method', 'Endpoint', 'Purpose') $masterRows @(900, 4100, 4360)
$body += Para 'Display Entry IDs' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Screen Key', 'Format', 'Notes') $idRows @(2200, 1800, 5360)
$body += Para 'Payload Field Summary' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Screen', 'Main Fields') $payloadRows @(1900, 7460)
$body += Para 'Request Examples' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'POST /mixing/cotton-hvi' 'Code'
$body += Para '{ "entry_id": "CH-1001", "inspection_date": "2026-06-10", "lot_no": "LOT-1", "variety": "Cotton", "invoice_no": "INV-1", "invoice_date": "2026-06-10", "sci": 120, "mic": 4.2, "rd": 78 }' 'Code'
$body += Para 'POST /mixing/qc' 'Code'
$body += Para '{ "consignee_name": "ABC Mills", "count_name": "40s Carded", "creation_date": "2026-06-10", "status": "UNDONE", "blends": [{ "blend_no": 1, "percentage": 50, "lot_no": "LOT-1", "cut_length": "38", "tenacity": 28, "elongation": 7, "merge_no": "M1" }] }' 'Code'
$body += Para 'Common Query Parameters' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Parameter', 'Type', 'Description') $queryRows @(2600, 1800, 4960)
$body += Para 'Database Tables and Sources' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Table/Source', 'Usage') $dbRows @(3600, 5760)
$body += Para 'Error Responses' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Status', 'Meaning') $errorRows @(1200, 8160)
$body += Para 'Implementation Notes' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Bullet 'Cotton HVI validates configured numeric fields before insert and returns field-level errors for invalid numbers.'
$body += Bullet 'Mixing QC update replaces all existing blend rows for the selected qc_id.'
$body += Bullet 'Openness creates a parent inspection and child entries in one transaction; entries are divided into stages using no_of_entries / 3.'
$body += Bullet 'Master dropdown endpoints return frontend-friendly options arrays alongside raw data and name/value lists.'
$body += Bullet 'SQL Server-backed dropdowns return 503 when SQL Server environment variables are unavailable.'

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
  <dc:title>Mixing API Documentation</dc:title>
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
