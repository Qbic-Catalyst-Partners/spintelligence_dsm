$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$docsApiDir = Join-Path $repoRoot 'docs\api'
$outPath = Join-Path $docsApiDir 'OCR Machine API Documentation.docx'
$tmp = Join-Path $repoRoot '__ocr_machine_api_docx'

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

$mountRows = @(
  @('Primary', '/ocr-machine', 'OCR machine UI and API router'),
  @('Alias', '/ocr-json', 'Rewrites to /api/ocr-json on the OCR machine router')
)

$endpointRows = @(
  @('GET', '/ocr-machine/', 'Serve static OCR machine UI from public/ocr-machine'),
  @('GET', '/ocr-machine/apct', 'Serve A Percent OCR page'),
  @('GET', '/ocr-machine/noils', 'Serve Noils OCR page'),
  @('GET', '/ocr-machine/strech', 'Serve Stretch OCR page'),
  @('GET', '/ocr-machine/stretch', 'Redirect to /strech'),
  @('GET', '/ocr-machine/api/fields', 'Return fields for a doc_type from upstream or local fallback'),
  @('POST', '/ocr-machine/api/ocr-json', 'Upload a file and return parsed OCR JSON'),
  @('POST', '/ocr-machine/api/ocr', 'Upload a file and stream OCR progress/events'),
  @('POST', '/ocr-machine/api/save', 'Save OCR/manual JSON to upstream service or local fallback tables'),
  @('POST', '/ocr-json', 'Compatibility alias for /ocr-machine/api/ocr-json')
)

$docTypeRows = @(
  @('hvi', 'HVI_FIELDS', 'Default HVI quality fields'),
  @('fibre / fiber', 'FIBRE_FIELDS', 'Fibre receipt fields'),
  @('afis', 'AFIS_FIELDS', 'AFIS property fields'),
  @('bwc', 'BWC_FIELDS', 'Between/Within Card sample weights and hanks'),
  @('drawing, carding, simplex', 'MACHINE_FIELDS', 'Machine OCR rows with date, ID, mac name, shift, hank/CV/user fields'),
  @('apct', 'APCT_FIELDS', 'A Percent OCR fields'),
  @('noils', 'NOILS_FIELDS', 'Comber Noils percent OCR fields'),
  @('strech / stretch', 'STRECH_FIELDS', 'Stretch percent OCR fields')
)

$ocrJsonRows = @(
  @('file', 'multipart file', 'Required; max 20 MB through multer'),
  @('doc_type', 'string', 'Optional; defaults to hvi and normalizes aliases such as fibre/fiber and stretch/strech'),
  @('filename detection', 'implicit', 'When doc_type is hvi, filename can auto-detect apct, noils, or strech')
)

$saveRows = @(
  @('doc_type', 'string', 'Document type used to choose upstream/local fallback behavior'),
  @('filename', 'string', 'Original or edited filename saved with record'),
  @('ocr_json', 'array/object', 'Raw OCR output saved as JSON'),
  @('manual_json', 'array', 'Required manual/edited rows for local saves'),
  @('mc_name', 'string', 'Machine name saved for machine doc types'),
  @('BWC fields', 'object values', 'BWC fallback saves sample weights and hanks into carding tables')
)

$responseRows = @(
  @('GET /api/fields', '200', 'fields, source, optional warning'),
  @('POST /api/ocr-json', '200', 'success, filename, doc_type, data, raw_tables, fields, raw_text'),
  @('POST /api/ocr', 'SSE', 'data events with step, msg, result or error'),
  @('POST /api/save', '200', 'id, status, source, optional warning'),
  @('POST /api/ocr-json or /api/ocr', '400', 'File is required')
)

$dbRows = @(
  @('hvi_records', 'Local fallback save table for HVI-like OCR/manual JSON records'),
  @('ocr_machine_records', 'Local save table for drawing, carding, and simplex machine OCR records'),
  @('carding.inspections', 'BWC fallback parent inspection table'),
  @('carding.sample_weights', 'BWC sample weight rows'),
  @('carding.hanks', 'BWC hank rows')
)

$envRows = @(
  @('OCR_SERVICE_URL', 'Legacy upstream OCR service URL; not required for same-repo deployment'),
  @('OCR_UPSTREAM_TIMEOUT_MS', 'Upstream field/proxy timeout; defaults to 15000'),
  @('OCR_LOCAL_TIMEOUT_MS', 'Local OCR process timeout; defaults to 240000'),
  @('OCR_STREAM_TIMEOUT_MS', 'Streaming OCR timeout; defaults to local timeout'),
  @('OCR_PYTHON_PATH', 'Preferred Python launcher for local OCR fallback')
)

$errorRows = @(
  @('400', 'Missing uploaded file or no manual_json fields to save'),
  @('502', 'Upstream OCR streaming failure from /api/ocr'),
  @('503', 'OCR service unavailable or local OCR/save fallback failed'),
  @('500', 'Local machine OCR save failed')
)

$body = ''
$body += Para 'OCR Machine API Documentation' 'Title' -Bold -Color '0B2545' -Size 36
$body += Para 'API reference for routes/ocrMachine.routes.js, including OCR UI pages, field mapping, OCR JSON parsing, streamed OCR progress, and save fallbacks.' 'Subtitle' -Color '4B5563' -Size 22
$body += Para 'Overview' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'The OCR Machine router is mounted under /ocr-machine and serves both static OCR UI pages and backend OCR proxy APIs. It calls an upstream OCR service when available and falls back to the embedded local OCR pipeline in ocr_service/run_ocr_pipeline.py.'
$body += Bullet 'Base route: /ocr-machine'
$body += Bullet 'Compatibility alias: /ocr-json rewrites to /ocr-machine/api/ocr-json.'
$body += Bullet 'File uploads use multipart/form-data with field name file and a 20 MB limit.'
$body += Bullet 'Local OCR tries OCR_PYTHON_PATH, Python 3.11 under LOCALAPPDATA, python, then py -3.'
$body += Para 'Mount Paths' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Type', 'Base Path', 'Purpose') $mountRows @(1400, 2200, 5760)
$body += Para 'Endpoints' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Method', 'Endpoint', 'Purpose') $endpointRows @(900, 3300, 5160)
$body += Para 'Supported Document Types' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('doc_type', 'Field Set', 'Purpose') $docTypeRows @(2300, 1900, 5160)
$body += Para 'OCR JSON Upload' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'POST /ocr-machine/api/ocr-json accepts a file upload and returns parsed JSON. A Percent uses the local parser directly; other types try the upstream /api/ocr-json service first and fall back to the local embedded parser when upstream is unavailable or returns empty data.'
$body += Table @('Field', 'Type', 'Description') $ocrJsonRows @(2200, 1700, 5460)
$body += Para 'Request Example' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'POST /ocr-machine/api/ocr-json multipart/form-data: file=<upload>, doc_type=hvi' 'Code'
$body += Para 'Streaming OCR' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'POST /ocr-machine/api/ocr streams text/event-stream events. Local handlers are used for A Percent and machine doc types; other document types proxy the upstream stream and fall back to local SSE events if the upstream service is unavailable.'
$body += Para 'Save OCR Data' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'POST /ocr-machine/api/save first attempts upstream /api/save. If the upstream service is unavailable, it saves machine doc types to ocr_machine_records, HVI-like data to hvi_records, and BWC data into carding inspection/sample/hank tables.'
$body += Table @('Field', 'Type', 'Description') $saveRows @(2200, 1700, 5460)
$body += Para 'Save Request Example' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para '{ "doc_type": "drawing", "filename": "report.pdf", "mc_name": "DF-1", "ocr_json": [], "manual_json": [{ "Mac Name": "DF-1", "Shift": "Day", "Avg. Hank": "0.12" }] }' 'Code'
$body += Para 'Response Summary' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Endpoint', 'Status', 'Main Fields') $responseRows @(3000, 1300, 5060)
$body += Para 'Database Tables' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Table', 'Usage') $dbRows @(2600, 6760)
$body += Para 'Environment Variables' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Variable', 'Purpose') $envRows @(2600, 6760)
$body += Para 'Error Responses' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Status', 'Meaning') $errorRows @(1200, 8160)
$body += Para 'Implementation Notes' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Bullet 'normalizeDocType maps fiber to fibre, stretch to strech, and filename heuristics can detect A%, Noils, and Stretch uploads.'
$body += Bullet 'GET /api/fields returns local fallback fields with source=local-fallback when the upstream OCR service is unavailable.'
$body += Bullet 'Temporary uploaded files are written under the OS temp directory for local OCR and removed in finally blocks.'
$body += Bullet 'The /stretch page redirects to /strech to match the existing public file name.'

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
  <dc:title>OCR Machine API Documentation</dc:title>
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
