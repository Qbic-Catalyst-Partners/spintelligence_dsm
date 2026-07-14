$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$docsApiDir = Join-Path $repoRoot 'docs\api'
$outPath = Join-Path $docsApiDir 'Operator Tickets API Documentation.docx'
$tmp = Join-Path $repoRoot '__operator_tickets_api_docx'

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
  @('Ticket Feed', 'GET /, GET /:id, GET /:id/timeline', 'Read operator tickets, details, notifications, and timeline'),
  @('Ticket Creation', 'POST /, POST /generate', 'Create manual tickets or generate tickets from threshold violations'),
  @('Ticket Workflow', 'PUT /:id/assign, PATCH/PUT /:id/status, PUT /submit/:id', 'Assign, update status, and submit tickets for approval'),
  @('Submission Frequency', '/submission-frequency*', 'Configure notebook submission frequency and create missed-submission tickets'),
  @('Threshold Master', '/thresholds*', 'Create, bulk import, list, update, activate/deactivate, and delete threshold rules'),
  @('Workflow Guide', 'GET /workflow/guide', 'Return frontend workflow guide and status flow')
)

$endpointRows = @(
  @('GET', '/operator-tickets', 'List non-acknowledgement operator tickets with notifications and filters'),
  @('GET', '/operator-tickets/submission-ticketing', 'List missed-submission/frequency tickets'),
  @('GET', '/operator-tickets/:id', 'Fetch one operator ticket by ticket_id'),
  @('GET', '/operator-tickets/:id/timeline', 'Fetch ticket timeline from ticket logs and comments'),
  @('POST', '/operator-tickets', 'Create one operator ticket and notify approvers'),
  @('POST', '/operator-tickets/generate', 'Generate tickets from actual values and configured thresholds'),
  @('PUT', '/operator-tickets/:id/assign', 'Assign ticket to a user'),
  @('PATCH/PUT', '/operator-tickets/:id/status', 'Update ticket status'),
  @('PUT', '/operator-tickets/submit/:id', 'Submit Open/Reopened ticket for approval'),
  @('GET', '/operator-tickets/workflow/guide', 'Return workflow guide')
)

$submissionRows = @(
  @('POST', '/submission-frequency', 'Create or update screen submission frequency config'),
  @('GET', '/submission-frequency', 'List submission frequency configs'),
  @('POST', '/submission-frequency/check', 'Check active configs and create missed-submission tickets'),
  @('POST', '/submission-frequency/tat/check', 'Run TAT expiry check and mark overdue missed-submission tickets No Due'),
  @('PATCH', '/submission-frequency/:id', 'Update submission frequency config'),
  @('PATCH', '/submission-frequency/:id/status', 'Activate or deactivate config'),
  @('DELETE', '/submission-frequency/:id', 'Delete submission frequency config')
)

$thresholdRows = @(
  @('GET', '/thresholds/list', 'List threshold rules with L1/L2/L3 approver arrays'),
  @('GET', '/thresholds/approver-options', 'List approver dropdown options'),
  @('POST', '/thresholds', 'Create or upsert one threshold rule'),
  @('POST', '/thresholds/bulk', 'Create or upsert multiple threshold rules from JSON body'),
  @('POST', '/thresholds/upload-csv', 'Create or upsert threshold rules from CSV upload'),
  @('PATCH', '/thresholds/:id/status', 'Activate or deactivate threshold rule'),
  @('PATCH', '/thresholds/:id', 'Update threshold values and approvers'),
  @('DELETE', '/thresholds/:id', 'Delete threshold rule')
)

$ticketPayloadRows = @(
  @('user_id / user_name', 'number/string', 'Assigned operator; can fall back to login context for generate'),
  @('machine_name', 'string', 'Notebook/machine/screen label'),
  @('parameter_name', 'array/string/object', 'Parameter(s) to evaluate; supports comma and JSON-array strings'),
  @('actual_value', 'object/string', 'Actual parameter values; JSON strings are parsed'),
  @('threshold_value', 'object/string', 'Fallback threshold rules when threshold_master has no match'),
  @('department / management_field', 'string', 'Department context for threshold lookup'),
  @('sub_department / erp_product_code', 'string', 'Sub-department context for threshold lookup'),
  @('input_screen', 'string', 'Input screen context for threshold lookup')
)

$thresholdPayloadRows = @(
  @('department', 'string/object', 'Required; dropdown objects are accepted'),
  @('sub_department / subDepartment', 'string/object', 'Required sub-department'),
  @('input_screen / inputScreen', 'string/object', 'Required input screen'),
  @('machine_name', 'string', 'Required machine/screen name'),
  @('input_field / inputField', 'string/object', 'Required parameter/field'),
  @('condition_level', 'string', 'More Than, Less Than, or More and Less Than'),
  @('plus_threshold, minus_threshold, actual_value', 'number/string', 'Threshold bounds; supports compact value like 10 (+2 / -2)'),
  @('approval_l1/l2/l3 user IDs or names', 'array/string/number', 'Approvers are resolved by ID/name and expected level')
)

$frequencyPayloadRows = @(
  @('screen_name', 'string', 'Required screen/notebook name'),
  @('department, sub_department', 'string/null', 'Optional context; part of conflict key'),
  @('frequency', 'integer', 'Required positive number of days between submissions'),
  @('occurrences', 'integer/null', 'Optional required submissions in the window'),
  @('approval_l1/l2/l3 and names', 'number/string/null', 'Approval routing metadata'),
  @('l1_tat_hours, l2_tat_hours, l3_tat_hours', 'integer/null', 'Positive TAT hours for each level'),
  @('is_active', 'boolean', 'Config active flag')
)

$queryRows = @(
  @('page', 'number', 'Ticket and submission ticket page number'),
  @('status', 'string', 'Ticket status filter; all disables filter'),
  @('severity', 'string', 'Severity filter; all disables filter'),
  @('machine / notebook', 'string', 'Machine/notebook filter'),
  @('operator / user_name', 'string', 'Submission-ticket operator filter'),
  @('start_date, end_date', 'date/string', 'Created-at date range filters'),
  @('department, sub_department, input_screen, machine_name', 'string', 'Threshold list filters'),
  @('user_id', 'number', 'For non-admin ticket visibility filtering')
)

$dbRows = @(
  @('ticketing_system.operator_tickets', 'Main ticket records, workflow status, violation details, approver arrays'),
  @('ticketing_system.notifications', 'In-app ticket notifications for approvers'),
  @('ticketing_system.ticket_logs', 'Timeline and status/submit logs'),
  @('ticketing_system.threshold_master', 'Threshold rules and legacy approver columns'),
  @('ticketing_system.threshold_master_l1_approvers', 'Threshold L1 approver join table'),
  @('ticketing_system.threshold_master_l2_approvers', 'Threshold L2 approver join table'),
  @('ticketing_system.threshold_master_l3_approvers', 'Threshold L3 approver join table'),
  @('ticketing_system.screen_submission_frequency', 'Submission frequency, occurrence, approval, and TAT config'),
  @('users.user_details', 'Operator/approver resolution by ID, employee ID, level, and name')
)

$statusRows = @(
  @('Open', 'New ticket or reopened ticket awaiting operator action'),
  @('In Progress', 'Submitted to approval after PUT /submit/:id'),
  @('Closed', 'Resolved/approved status'),
  @('Reopened', 'Returned for operator resubmission'),
  @('No Due', 'Missed-submission ticket expired by TAT check')
)

$errorRows = @(
  @('400', 'Missing required payload fields, invalid status, invalid TAT/frequency, missing CSV file, or invalid approver'),
  @('404', 'Ticket, assigned user, threshold, or submission config not found'),
  @('500', 'Unhandled database/server/email error')
)

$body = ''
$body += Para 'Operator Tickets API Documentation' 'Title' -Bold -Color '0B2545' -Size 36
$body += Para 'API reference for routes/operatorTickets.routes.js, including operator ticket creation, threshold rules, submission-frequency tickets, assignment, status updates, and approval submission.' 'Subtitle' -Color '4B5563' -Size 22
$body += Para 'Overview' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'The Operator Tickets API is mounted under /operator-tickets. It supports threshold-breach tickets, missed-submission tickets, workflow status changes, approver notifications, threshold master configuration, and submission-frequency checks.'
$body += Bullet 'Base route: /operator-tickets'
$body += Bullet 'Content type: application/json, except /thresholds/upload-csv uses multipart/form-data field file.'
$body += Bullet 'Server mount: server.js uses app.use("/operator-tickets", operatorTicketRoutes).'
$body += Bullet 'The router relies on global auth middleware mounted before /operator-tickets in server.js.'
$body += Para 'Module Summary' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Module', 'Main Route', 'Purpose') $moduleRows @(2200, 3000, 4160)
$body += Para 'Ticket Endpoints' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Method', 'Endpoint', 'Purpose') $endpointRows @(900, 3500, 4960)
$body += Para 'Submission Frequency Endpoints' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Method', 'Endpoint', 'Purpose') $submissionRows @(900, 3700, 4760)
$body += Para 'Threshold Master Endpoints' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Method', 'Endpoint', 'Purpose') $thresholdRows @(900, 3600, 4860)
$body += Para 'Ticket Payload Fields' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Field', 'Type', 'Description') $ticketPayloadRows @(2600, 1800, 4960)
$body += Para 'Threshold Payload Fields' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Field', 'Type', 'Description') $thresholdPayloadRows @(2800, 1700, 4860)
$body += Para 'Submission Frequency Fields' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Field', 'Type', 'Description') $frequencyPayloadRows @(2700, 1700, 4960)
$body += Para 'Request Examples' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'POST /operator-tickets/generate' 'Code'
$body += Para '{ "tickets": [{ "user_id": 7, "machine_name": "Cotton HVI Data Entry", "parameter_name": ["mic"], "actual_value": { "mic": 5.2 }, "department": "Quality", "sub_department": "Mixing", "input_screen": "Cotton HVI Data Entry" }] }' 'Code'
$body += Para 'POST /operator-tickets/thresholds' 'Code'
$body += Para '{ "department": "Quality", "sub_department": "Mixing", "input_screen": "Cotton HVI Data Entry", "machine_name": "Cotton HVI Data Entry", "input_field": "mic", "condition_level": "More Than", "plus_threshold": 5, "minus_threshold": 0, "approval_l1_user_ids": [7] }' 'Code'
$body += Para 'Common Query Parameters' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Parameter', 'Type', 'Description') $queryRows @(2600, 1700, 5060)
$body += Para 'Status Flow' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Status', 'Meaning') $statusRows @(1800, 7560)
$body += Para 'Database Tables' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Table', 'Usage') $dbRows @(3800, 5560)
$body += Para 'Error Responses' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Status', 'Meaning') $errorRows @(1200, 8160)
$body += Para 'Implementation Notes' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Bullet 'Ticket generation evaluates missing values and threshold breaches; ticket_reason can be MISSING_VALUE, THRESHOLD_BREACH, or BOTH.'
$body += Bullet 'Threshold conditions supported by evaluation are More Than, Less Than, and More and Less Than.'
$body += Bullet 'POST /generate skips tickets when no threshold exists or when actual values do not violate configured thresholds.'
$body += Bullet 'PUT /submit/:id accepts operator_comment, comment, or remarks and stores the value in violation_details.operator_comment.'
$body += Bullet 'Submission-frequency acknowledgement tickets are excluded from normal ticket list/detail queries by nonAcknowledgementTicketWhere.'

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
  <dc:title>Operator Tickets API Documentation</dc:title>
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
