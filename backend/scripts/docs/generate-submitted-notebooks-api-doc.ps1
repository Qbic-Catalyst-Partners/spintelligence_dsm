$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$docsApiDir = Join-Path $repoRoot 'docs\api'
$outPath = Join-Path $docsApiDir 'Submitted Notebooks API Documentation.docx'
$tmp = Join-Path $repoRoot '__submitted_notebooks_api_docx'

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
  @('POST', '/submitted-notebooks/acknowledgement-thresholds', 'Create or update acknowledgement threshold for a screen'),
  @('GET', '/submitted-notebooks/acknowledgement-thresholds', 'List acknowledgement thresholds'),
  @('POST', '/submitted-notebooks', 'Create or update a submitted notebook record'),
  @('GET', '/submitted-notebooks', 'List submitted notebooks visible to the current user'),
  @('POST', '/submitted-notebooks/generate-overdue-tickets', 'Manually generate overdue acknowledgement tickets'),
  @('GET', '/submitted-notebooks/:id', 'Get submitted notebook by numeric ID or notebook_submission_id'),
  @('PATCH', '/submitted-notebooks/:id/acknowledge', 'Acknowledge a submitted notebook and close linked overdue ticket')
)

$mountRows = @(
  @('/submitted-notebooks', 'Primary route mount'),
  @('/l2/submitted-notebooks', 'L2-facing alias mount using the same router')
)

$thresholdRows = @(
  @('screen_name / notebook / input_screen', 'string', 'Yes', 'Screen or notebook name'),
  @('department', 'string', 'No', 'Department scope'),
  @('sub_department / subDepartment', 'string', 'No', 'Sub-department scope'),
  @('acknowledge_within_hours / l2_tat_hours / tat_hours', 'number', 'Yes', 'Positive integer acknowledgement deadline'),
  @('is_active', 'boolean', 'No', 'Defaults true'),
  @('approval_l2, approval_l2_name', 'string', 'No', 'Display metadata for L2 approver'),
  @('approval_l3, approval_l3_name', 'string', 'No', 'Display metadata for L3 approver')
)

$submitRows = @(
  @('notebook / title / input_screen', 'string', 'Yes', 'Notebook or screen name'),
  @('notebook_submission_id', 'string', 'No', 'Unique submission ID; generated when omitted'),
  @('department, sub_department', 'string', 'No', 'Department context'),
  @('entry_id', 'string', 'No', 'Source screen entry ID'),
  @('source_schema, source_table, source_record_id', 'string', 'No', 'Source record metadata'),
  @('submitted_by_user_id / submitted_by_name', 'number/string', 'No', 'Defaults from authenticated user'),
  @('submitted_payload / fields / payload', 'object', 'No', 'Stored as JSONB payload'),
  @('l2/l3 approver user or employee IDs', 'array/string/object', 'No', 'Resolved into approver user ID arrays'),
  @('submitted_at, ack_due_at', 'datetime', 'No', 'ack_due_at is calculated if omitted')
)

$queryRows = @(
  @('page', 'number', 'List page number; defaults to 1'),
  @('limit', 'number', 'List page size; defaults to 20, max 100'),
  @('status', 'string', 'Optional submitted_notebooks.status filter'),
  @('department', 'string', 'Optional exact department filter'),
  @('sub_department / subDepartment', 'string', 'Optional exact sub-department filter')
)

$responseRows = @(
  @('POST acknowledgement-thresholds', '200', 'message, submission_threshold, acknowledgement_threshold'),
  @('GET acknowledgement-thresholds', '200', 'acknowledgement_thresholds, data'),
  @('POST submitted-notebooks', '201', 'success, submitted_notebook'),
  @('GET submitted-notebooks', '200', 'submitted_notebooks, data, pagination'),
  @('POST generate-overdue-tickets', '200', 'success, created_count, tickets'),
  @('GET submitted-notebooks/:id', '200', 'submitted_notebook with assigned L2/L3 users'),
  @('PATCH acknowledge', '200', 'success, submitted_notebook')
)

$statusRows = @(
  @('PENDING_ACK', 'Default status for new submitted notebooks awaiting acknowledgement'),
  @('ACKNOWLEDGED', 'Set by PATCH /:id/acknowledge'),
  @('Overdue ticket linked', 'overdue_ticket_id and overdue_ticket_created_at are populated when overdue worker creates or finds a ticket')
)

$tableRows = @(
  @('ticketing_system.submitted_notebooks', 'Main submitted notebook records and acknowledgement state'),
  @('ticketing_system.notebook_acknowledgement_threshold', 'Acknowledgement deadline configuration per screen/department/sub-department'),
  @('ticketing_system.screen_submission_frequency', 'Required submission threshold source and fallback L2 TAT configuration'),
  @('ticketing_system.operator_tickets', 'Overdue acknowledgement review tickets'),
  @('ticketing_system.ticket_logs', 'ACK_REVIEW_CREATED and ACKNOWLEDGED audit logs'),
  @('ticketing_system.notifications', 'Notifications sent for overdue acknowledgement tickets'),
  @('users.user_details', 'Submitter and L2/L3 approver lookup')
)

$errorRows = @(
  @('400', 'Missing notebook, missing threshold fields, or acknowledgement threshold created before submission threshold'),
  @('403', 'Current user is not authorized to view or acknowledge the submitted notebook'),
  @('404', 'Submitted notebook was not found'),
  @('500', 'Unhandled database/server error')
)

$body = ''
$body += Para 'Submitted Notebooks API Documentation' 'Title' -Bold -Color '0B2545' -Size 36
$body += Para 'API reference for routes/submittedNotebooks.routes.js, including submitted notebook tracking, acknowledgement thresholds, L2/L3 visibility, acknowledgement, and overdue-ticket generation.' 'Subtitle' -Color '4B5563' -Size 22
$body += Para 'Overview' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'The Submitted Notebooks API records notebook submissions, calculates acknowledgement deadlines, lets assigned users acknowledge submissions, and creates overdue review tickets when submissions are not acknowledged on time.'
$body += Bullet 'Authentication: all router endpoints run after router.use(auth).'
$body += Bullet 'Content type: application/json'
$body += Bullet 'Default acknowledgement deadline: 24 hours when no acknowledgement threshold or L2 TAT is configured.'
$body += Bullet 'Server mount: server.js mounts this router at /submitted-notebooks and /l2/submitted-notebooks.'
$body += Para 'Route Mounts' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Base Route', 'Purpose') $mountRows @(3300, 6060)
$body += Para 'Endpoints' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Method', 'Endpoint', 'Purpose') $endpointRows @(900, 4300, 4160)
$body += Para 'Acknowledgement Threshold Payload' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Field', 'Type', 'Required', 'Description') $thresholdRows @(3000, 1700, 1000, 3660)
$body += Para 'Submitted Notebook Payload' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Field', 'Type', 'Required', 'Description') $submitRows @(3000, 1700, 1000, 3660)
$body += Para 'List Query Parameters' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Parameter', 'Type', 'Description') $queryRows @(2600, 1700, 5060)
$body += Para 'Response Summary' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Endpoint', 'Status', 'Main Fields') $responseRows @(3600, 1100, 4660)
$body += Para 'Status Flow' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Status/State', 'Meaning') $statusRows @(2600, 6760)
$body += Para 'Request Examples' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'POST /submitted-notebooks' 'Code'
$body += Para '{ "notebook": "Ring Frame", "department": "Spinning", "entry_id": "#SRI-0001", "submitted_payload": { "shift": "A" }, "l2_approver_user_ids": [12] }' 'Code'
$body += Para 'PATCH /submitted-notebooks/NB-Ring-Frame-%23SRI-0001-notebook/acknowledge' 'Code'
$body += Para '{ "note": "Reviewed and acknowledged" }' 'Code'
$body += Para 'Database Tables' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Table', 'Usage') $tableRows @(3800, 5560)
$body += Para 'Error Responses' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Status', 'Meaning') $errorRows @(1200, 8160)
$body += Para 'Implementation Notes' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Bullet 'POST /acknowledgement-thresholds requires a matching active submission frequency configuration before saving the acknowledgement threshold.'
$body += Bullet 'POST /submitted-notebooks uses notebook_submission_id as an upsert key; duplicate submissions update payload and approver arrays.'
$body += Bullet 'Non-admin list/detail access is limited to the submitter or assigned L2/L3 approver user IDs.'
$body += Bullet 'generateOverdueNotebookTickets creates MISSING_VALUE review tickets for PENDING_ACK submissions past ack_due_at.'
$body += Bullet 'Acknowledgement closes an existing overdue ticket and writes an ACKNOWLEDGED ticket log.'

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
  <dc:title>Submitted Notebooks API Documentation</dc:title>
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
