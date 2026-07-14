$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$docsApiDir = Join-Path $repoRoot 'docs\api'
$outPath = Join-Path $docsApiDir 'Supervisor Tickets API Documentation.docx'
$tmp = Join-Path $repoRoot '__supervisor_tickets_api_docx'

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
  @('/api/supervisor-tickets', 'Primary API mount used by documented workflow links'),
  @('/supervisor-tickets', 'Compatibility mount for frontend routes')
)

$endpointRows = @(
  @('GET', '/tickets', 'List supervisor-visible tickets with filters and pagination'),
  @('GET', '/tickets/:id/l2-preview', 'Fetch L2 review preview with submitted fields, threshold fields, timeline, notifications, and action endpoints'),
  @('GET', '/tickets/timeline/graph', 'Return ticket counts by date for SCI/GTEX timeline graph'),
  @('GET', '/tickets/:id', 'Fetch ticket detail by ticket_id'),
  @('GET', '/tickets/:id/timeline', 'Fetch normalized ticket timeline and resolution submission summary'),
  @('PATCH', '/tickets/acknowledge', 'Acknowledge and close acknowledgement-review ticket'),
  @('PATCH/PUT', '/tickets/status', 'Update non-acknowledgement ticket status'),
  @('PATCH', '/tickets/approve', 'Approve non-acknowledgement ticket and close it'),
  @('PATCH', '/tickets/reject', 'Reject non-acknowledgement ticket, reopen it, and notify owner'),
  @('POST', '/assign', 'Assign employee to supervisor; admin only'),
  @('DELETE', '/unassign', 'Soft-unassign employee from supervisor; admin only'),
  @('GET', '/supervisor/:supervisorId/employees', 'List active employees under supervisor'),
  @('GET', '/employee/:employeeId/supervisor', 'List active supervisors for employee')
)

$filterRows = @(
  @('stage / level', 'L1/L2/L3', 'Requested reviewer stage; defaults to requester level or L2'),
  @('status', 'string', 'Ticket status filter; use all to disable'),
  @('severity', 'string', 'Severity filter; use all to disable'),
  @('machine', 'string', 'Machine/input screen filter; use all to disable'),
  @('start_date', 'date', 'Created-at lower date bound'),
  @('end_date', 'date', 'Created-at upper date bound'),
  @('page', 'number', 'List page; defaults to 1'),
  @('limit', 'number', 'List page size; defaults to 25')
)

$actionRows = @(
  @('ticketId / ticket_id', 'query or body', 'Required by acknowledge, status, approve, and reject endpoints'),
  @('status / ticket_status / ticketStatus', 'body', 'Used by /tickets/status; accepts Open, In Progress, Closed, Reopened and aliases'),
  @('note / acknowledgement_note', 'body', 'Optional acknowledgement note for acknowledgement-review tickets')
)

$workflowRows = @(
  @('Approve', 'PATCH /api/supervisor-tickets/tickets/approve?ticketId={ticket_id}', 'Sets status to Closed and logs Approved'),
  @('Reject', 'PATCH /api/supervisor-tickets/tickets/reject?ticketId={ticket_id}', 'Sets status to Reopened, logs Rejected, notifies ticket owner'),
  @('Status update', 'PATCH or PUT /api/supervisor-tickets/tickets/status', 'Sets normalized status and logs STATUS_UPDATED_*'),
  @('Acknowledge', 'PATCH /api/supervisor-tickets/tickets/acknowledge?ticketId={ticket_id}', 'Closes acknowledgement review ticket and acknowledges submitted notebook')
)

$responseRows = @(
  @('GET /tickets', 'stage, tickets, data, pagination'),
  @('GET /tickets/:id/l2-preview', 'ticket_id, status, stage, submitted_by, value_summary, approval, timeline, notifications'),
  @('GET /tickets/timeline/graph', 'stage, points, series.sci, series.gtex'),
  @('GET /tickets/:id', 'ticket'),
  @('GET /tickets/:id/timeline', 'ticket_id, status, stage, timeline, resolution_submission'),
  @('PATCH actions', 'message, ticket, tickets, data'),
  @('Assignment endpoints', 'assignment or employees/supervisors arrays')
)

$accessRows = @(
  @('Admin / Super Admin / ADMIN001', 'Can view all tickets and update/approve/reject/acknowledge tickets'),
  @('L1/L2/L3 reviewer', 'Can view and act only when assigned in approval_l1_user_ids, approval_l2_user_ids, or approval_l3_user_ids'),
  @('Acknowledgement-review ticket', 'Uses ACKNOWLEDGE action mode instead of approve/reject'),
  @('Assignment write endpoints', 'Admin-only'),
  @('Assignment read endpoints', 'Admin can view all; non-admin can view only self-scoped mapping')
)

$tableRows = @(
  @('ticketing_system.operator_tickets', 'Main supervisor ticket source and status updates'),
  @('ticketing_system.ticket_logs', 'Timeline and action audit trail'),
  @('ticketing_system.notifications', 'Notification lookup and rejection notification creation'),
  @('ticketing_system.submitted_notebooks', 'Acknowledgement-review tickets update submitted notebook acknowledgement state'),
  @('users.user_details', 'Reviewer, owner, employee code, role, and level lookup'),
  @('users.supervisor_assignments', 'Supervisor-to-employee mappings exposed by assignment endpoints')
)

$errorRows = @(
  @('400', 'Missing ticketId, invalid status, invalid supervisor/employee ID, or missing assignment identifiers'),
  @('401', 'Authentication required'),
  @('403', 'Requester is not authorized to view or act on ticket/mapping'),
  @('404', 'Ticket, acknowledgement ticket, or assignment not found'),
  @('500', 'Unhandled database/server error')
)

$body = ''
$body += Para 'Supervisor Tickets API Documentation' 'Title' -Bold -Color '0B2545' -Size 36
$body += Para 'API reference for routes/supervisorTickets.routes.js, including ticket review lists, previews, timelines, approval/rejection/status actions, acknowledgement-review tickets, and embedded supervisor assignment routes.' 'Subtitle' -Color '4B5563' -Size 22
$body += Para 'Overview' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'The Supervisor Tickets API is used by L1/L2/L3 reviewers and admins to review operator tickets, inspect timelines, approve or reject resolutions, acknowledge overdue submitted-notebook review tickets, and manage supervisor assignments.'
$body += Bullet 'Authentication: all endpoints run after router.use(auth).'
$body += Bullet 'Ticket actions use ticketId or ticket_id from query/body.'
$body += Bullet 'Server mounts: /api/supervisor-tickets and /supervisor-tickets.'
$body += Bullet 'Acknowledgement-review tickets are MISSING_VALUE tickets with MISSED_FREQUENCY category and ticket_type SUBMISSION_ACKNOWLEDGEMENT or NOTEBOOK_ACK_OVERDUE.'
$body += Para 'Route Mounts' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Base Route', 'Purpose') $mountRows @(3300, 6060)
$body += Para 'Endpoints' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Method', 'Endpoint', 'Purpose') $endpointRows @(1100, 4200, 4060)
$body += Para 'Ticket List Filters' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Parameter', 'Type', 'Description') $filterRows @(2400, 1800, 5160)
$body += Para 'Action Payloads' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Field', 'Location', 'Description') $actionRows @(2800, 1800, 4760)
$body += Para 'Workflow Actions' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Action', 'Endpoint', 'Result') $workflowRows @(1600, 4300, 3460)
$body += Para 'Access Rules' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('User/Mode', 'Behavior') $accessRows @(3000, 6360)
$body += Para 'Response Summary' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Endpoint', 'Main Fields') $responseRows @(3600, 5760)
$body += Para 'Request Examples' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'GET /api/supervisor-tickets/tickets?stage=L2&status=In%20Progress&page=1&limit=25' 'Code'
$body += Para 'PATCH /api/supervisor-tickets/tickets/approve?ticketId=TK-0001' 'Code'
$body += Para 'PATCH /api/supervisor-tickets/tickets/status' 'Code'
$body += Para '{ "ticketId": "TK-0001", "status": "Closed" }' 'Code'
$body += Para 'Database Tables' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Table', 'Usage') $tableRows @(3600, 5760)
$body += Para 'Error Responses' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Status', 'Meaning') $errorRows @(1200, 8160)
$body += Para 'Implementation Notes' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Bullet 'ensureOperatorTicketApprovalColumns adds approval_l1_user_ids, approval_l2_user_ids, approval_l3_user_ids, and ticket_type to operator_tickets when needed.'
$body += Bullet 'Ticket list responses include actual, standard, and threshold display aliases derived from JSONB fields.'
$body += Bullet 'L2 preview returns action endpoints; acknowledgement-review tickets expose acknowledge_endpoint and hide approve/reject endpoints.'
$body += Bullet 'Rejecting a ticket reopens it and creates a TICKET_REOPENED notification for the ticket owner.'
$body += Bullet 'The bottom assignment routes duplicate supervisor assignment behavior for compatibility with this router.'

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
  <dc:title>Supervisor Tickets API Documentation</dc:title>
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
