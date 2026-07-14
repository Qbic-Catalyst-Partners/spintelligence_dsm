$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$docsApiDir = Join-Path $repoRoot 'docs\api'
$outPath = Join-Path $docsApiDir 'Analysis API Documentation.docx'
$tmp = Join-Path $repoRoot '__analysis_api_docx'

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
  @('Primary', '/analysis', 'Main analysis API mount'),
  @('API alias', '/api/analysis', 'Frontend/API compatibility mount'),
  @('Ticket alias', '/ticket-analysis', 'Ticket analysis compatibility mount')
)

$endpointRows = @(
  @('GET', '/analysis/team-performance/options', 'Fetch dropdown options for team performance filters'),
  @('GET', '/analysis/l1', 'Fetch L1 user performance metrics'),
  @('GET', '/analysis/l2', 'Fetch L2 approval performance metrics'),
  @('GET', '/analysis/team-performance', 'Fetch combined team performance analysis'),
  @('GET', '/analysis/team-performance-analysis', 'Alias for team performance analysis'),
  @('GET', '/analysis/team-performance/analysis', 'Alias for team performance analysis'),
  @('GET', '/analysis/ranking', 'Fetch L1 ranking/quadrant data'),
  @('POST', '/analysis/snapshot', 'Save an analysis snapshot and notify subscribers'),
  @('GET', '/analysis/notifications', 'List current user analysis notifications'),
  @('PATCH', '/analysis/notifications/:id/read', 'Mark one notification as read'),
  @('GET', '/analysis/subscriptions', 'List current user analysis notification subscriptions'),
  @('POST', '/analysis/subscriptions', 'Create or update an analysis notification subscription'),
  @('POST', '/analysis/dev/seed-sample-data', 'Admin-only endpoint to seed sample analysis data')
)

$queryRows = @(
  @('period', 'string', 'today, week, month, quarter, quater, year, custom, 1d, 1w, 1m, or 1y'),
  @('start_date, from_date, custom_from', 'date/string', 'Required for custom period lower bound'),
  @('end_date, to_date, custom_to', 'date/string', 'Required for custom period upper bound'),
  @('user_id', 'number', 'Optional target user for L1/L2 metrics; defaults to authenticated user'),
  @('department or management_field', 'string', 'Filters operator_tickets.management_field'),
  @('sub_department, subDepartment, erp_product_code', 'string', 'Filters operator_tickets.erp_product_code'),
  @('notebook, input_screen, inputScreen, machine_name', 'string', 'Filters operator_tickets.machine_name')
)

$periodRows = @(
  @('today or 1d', 'Current UTC day'),
  @('week or 1w', 'Current UTC week, Monday through Sunday'),
  @('month or 1m', 'Current UTC month'),
  @('quarter or quater', 'Current UTC quarter'),
  @('year or 1y', 'Current UTC year'),
  @('custom', 'Uses supplied start and end date boundaries')
)

$responseRows = @(
  @('team-performance/options', 'filter, departments, sub_departments, notebooks, input_screens, users'),
  @('l1', 'period, period_key, range, level, filter, metrics'),
  @('l2', 'period, period_key, range, level, filter, metrics'),
  @('team-performance', 'period, period_key, range, filter, l1, l2, team_members_performance'),
  @('ranking', 'period, period_key, range, filter, quadrant_axes, ranking'),
  @('snapshot', 'message, snapshot'),
  @('notifications', 'notifications'),
  @('subscriptions', 'subscriptions or subscription')
)

$l1MetricRows = @(
  @('allocated_submissions', 'Tickets submitted by or allocated to the L1 user'),
  @('on_time_submissions', 'Submissions completed before L1 TAT due time'),
  @('delayed_submissions', 'Submissions past L1 TAT due time'),
  @('reworked_submissions', 'Submissions with resubmission or reopened status'),
  @('submission_efficiency', 'on_time_submissions percentage'),
  @('allocated_tickets', 'Tickets assigned to L1 approval users'),
  @('on_time_resolutions', 'L1 resolutions completed before TAT due time'),
  @('delayed_resolutions', 'L1 resolutions past TAT due time'),
  @('reworked_resolutions', 'L1 tickets rejected or reopened'),
  @('first_time_approval_rate', 'Closed tickets without rejection'),
  @('average_efficiency', 'Average of submission and resolution efficiency'),
  @('ranking', 'Current user ranking score in L1 comparison')
)

$l2MetricRows = @(
  @('allocated_tickets', 'Tickets assigned to L2 approval users'),
  @('on_time_approvals', 'L2 approvals completed before TAT due time'),
  @('delayed_approvals', 'L2 approvals past TAT due time'),
  @('approval_efficiency', 'on_time_approvals percentage')
)

$snapshotRows = @(
  @('period', 'string', 'Required/optional; defaults to today'),
  @('start_date', 'date/string', 'Required for custom period'),
  @('end_date', 'date/string', 'Required for custom period'),
  @('l1', 'object', 'Optional L1 payload'),
  @('l2', 'object', 'Optional L2 payload'),
  @('ranking', 'array', 'Optional ranking payload')
)

$subscriptionRows = @(
  @('channel', 'string', 'Defaults to app_push; only app_push is supported'),
  @('target_level', 'string', 'L1, L2, L3, or ALL; defaults to ALL'),
  @('is_active', 'boolean', 'Defaults to true')
)

$dbRows = @(
  @('ticketing_system.operator_tickets', 'Primary ticket analytics source'),
  @('ticketing_system.ticket_logs', 'Submission, resubmission, approval, and rejection event source'),
  @('users.user_details', 'User, level, and department source'),
  @('ticketing_system.analysis_snapshots', 'Saved analysis snapshots'),
  @('ticketing_system.analysis_notification_subscriptions', 'User notification subscriptions'),
  @('ticketing_system.analysis_notification_events', 'Generated analysis notifications')
)

$errorRows = @(
  @('400', 'Invalid period, invalid custom dates, invalid notification id, unsupported channel, or invalid target_level'),
  @('401', 'Authentication required'),
  @('403', 'Only admin can seed test data'),
  @('404', 'Notification not found'),
  @('500', 'Unhandled database or server error')
)

$body = ''
$body += Para 'Analysis API Documentation' 'Title' -Bold -Color '0B2545' -Size 36
$body += Para 'API reference for ticket analytics, team performance, ranking, snapshots, notifications, subscriptions, and sample analysis data in routes/analysis.routes.js.' 'Subtitle' -Color '4B5563' -Size 22
$body += Para 'Overview' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'The Analysis API is an authenticated route group for L1 and L2 ticket performance analysis. It calculates submission, resolution, approval, ranking, team member, snapshot, and notification data from ticketing tables.'
$body += Bullet 'Base routes: /analysis, /api/analysis, and /ticket-analysis'
$body += Bullet 'Authentication: router.use(auth) applies to every route.'
$body += Bullet 'Content type: application/json for POST and PATCH requests.'
$body += Bullet 'Primary data source: ticketing_system.operator_tickets joined with ticketing_system.ticket_logs and users.user_details.'
$body += Para 'Mount Paths' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Type', 'Base Path', 'Purpose') $mountRows @(1600, 2500, 5260)
$body += Para 'Endpoints' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Method', 'Endpoint', 'Purpose') $endpointRows @(900, 3900, 4560)
$body += Para 'Common Query Parameters' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Parameter', 'Type', 'Description') $queryRows @(3100, 1700, 4560)
$body += Para 'Supported Periods' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Period', 'Meaning') $periodRows @(2200, 7160)
$body += Para 'Response Families' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Endpoint Family', 'Main Fields') $responseRows @(3100, 6260)
$body += Para 'L1 Metrics' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Metric', 'Description') $l1MetricRows @(2800, 6560)
$body += Para 'L2 Metrics' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Metric', 'Description') $l2MetricRows @(2800, 6560)
$body += Para 'Options Endpoint' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'GET /analysis/team-performance/options returns departments, sub_departments, notebooks/input_screens, and L1/L2/L3 users for the analytics UI.'
$body += Para 'Example: GET /analysis/team-performance/options?department=Spinning&sub_department=Autoconer' 'Code'
$body += Para 'Team Performance Workflow' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Bullet 'Use /analysis/team-performance/options to populate filters.'
$body += Bullet 'Use /analysis/l1 for a focused L1 metric card set.'
$body += Bullet 'Use /analysis/l2 for a focused L2 approval metric card set.'
$body += Bullet 'Use /analysis/team-performance or either alias for combined L1, L2, and top team member performance.'
$body += Bullet 'Use /analysis/ranking for quadrant/ranking data with submission_efficiency on x and resolution_efficiency on y.'
$body += Para 'Snapshot Payload' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'POST /analysis/snapshot stores the supplied analysis payload and creates notification events for active subscribers.'
$body += Table @('Field', 'Type', 'Description') $snapshotRows @(2200, 1600, 5560)
$body += Para 'Snapshot Request Example' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para '{ "period": "month", "l1": { "metrics": {} }, "l2": { "metrics": {} }, "ranking": [] }' 'Code'
$body += Para 'Notifications' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Bullet 'GET /analysis/notifications returns the latest 12 notifications for the authenticated user.'
$body += Bullet 'PATCH /analysis/notifications/:id/read marks a notification as read for the authenticated user.'
$body += Bullet 'The read endpoint returns 404 when the notification does not belong to the user or does not exist.'
$body += Para 'Subscriptions' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'POST /analysis/subscriptions upserts a subscription by user_id, channel, and target_level.'
$body += Table @('Field', 'Type', 'Description') $subscriptionRows @(2200, 1600, 5560)
$body += Para 'Dev Seed Endpoint' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'POST /analysis/dev/seed-sample-data creates sample operator tickets, ticket logs, and optional notification events for testing. This endpoint is admin-only.'
$body += Bullet 'count defaults to 120 and is capped at 5000.'
$body += Bullet 'period defaults to month.'
$body += Bullet 'tat_level_mode accepts L1, L2, or mixed behavior through the request body.'
$body += Bullet 'create_notifications defaults to true.'
$body += Para 'Database Tables' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Table', 'Purpose') $dbRows @(3900, 5460)
$body += Para 'Error Responses' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Status', 'Meaning') $errorRows @(1200, 8160)
$body += Para 'Implementation Notes' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Bullet 'Period aliases are normalized before date boundaries are calculated.'
$body += Bullet 'Custom periods require valid start and end date values.'
$body += Bullet 'Filters map department to management_field, sub_department to erp_product_code, and notebook/input_screen to machine_name.'
$body += Bullet 'Percentage metrics are rounded to four decimal places.'
$body += Bullet 'The typo period quater is accepted and normalized to quarter.'
$body += Bullet 'Notification subscriptions currently support only the app_push channel.'

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
  <dc:title>Analysis API Documentation</dc:title>
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
