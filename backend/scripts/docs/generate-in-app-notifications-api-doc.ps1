$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$docsApiDir = Join-Path $repoRoot 'docs\api'
$outPath = Join-Path $docsApiDir 'In-App Notifications API Documentation.docx'
$tmp = Join-Path $repoRoot '__in_app_notifications_api_docx'

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
  @('Primary', '/in-app-notifications', 'In-app notification API mount'),
  @('Alias', '/notifications', 'Compatibility alias using the same router')
)

$endpointRows = @(
  @('GET', '/', 'List current user notifications from ticket and analysis sources'),
  @('PATCH', '/:source/:id/read', 'Mark one ticket or analysis notification as read'),
  @('POST', '/test', 'Create a manual test notification for the current or admin-selected user'),
  @('PATCH', '/read-all', 'Mark all unread ticket and analysis notifications as read')
)

$queryRows = @(
  @('user_id', 'number', 'Optional target user ID; only admins can access another user notifications'),
  @('page', 'number', 'Optional page number for list API; defaults to 1'),
  @('limit', 'number', 'Optional page size for list API; defaults to 20 and is capped at 100'),
  @('unread_only', 'boolean/string', 'true, 1, yes, or unread returns unread notifications only'),
  @('type', 'string', 'Optional notification type filter; all disables the filter'),
  @('category', 'string', 'Optional category filter; Ticket/Report/Threshold normalize to Tickets/Reports/Thresholds'),
  @('priority', 'string', 'Optional priority filter; all disables the filter')
)

$notificationRows = @(
  @('source', 'string', 'ticket or analysis'),
  @('id', 'number', 'Internal numeric ID used by mark-read endpoint'),
  @('notification_id', 'string', 'Ticket notification_id or analysis ID formatted as AN-{id}'),
  @('ticket_id', 'string/null', 'Ticket ID for ticket notifications; null for analysis notifications'),
  @('type', 'string', 'Ticket notification_type or ANALYSIS'),
  @('category', 'string', 'Tickets, Reports, Thresholds, System, Data Entry, or OCR style category'),
  @('priority', 'string', 'Critical, High, Medium, or Low'),
  @('status / is_unread', 'string/boolean', 'READ or UNREAD plus boolean unread flag'),
  @('title, body, link_url', 'string', 'Display content and optional navigation link'),
  @('payload', 'json', 'Metadata JSON, merged with ticket_id and notification_type for ticket rows'),
  @('created_at, read_at', 'datetime', 'Created/sent timestamp and read timestamp')
)

$testRows = @(
  @('user_id', 'number', 'Optional target user ID; admins only when different from current user'),
  @('type', 'string', 'Defaults to TEST'),
  @('category', 'string', 'Defaults to Tickets and is normalized by createNotification'),
  @('priority', 'string', 'Defaults to Medium and is normalized by createNotification'),
  @('title', 'string', 'Defaults to Test notification'),
  @('body', 'string', 'Defaults to This is a test app notification'),
  @('link_url', 'string', 'Optional URL/path for frontend navigation'),
  @('payload', 'object', 'Optional metadata merged with source=manual_backend_test')
)

$responseRows = @(
  @('GET /', '200', 'notifications, unread_count, pagination.page, pagination.limit, pagination.total'),
  @('PATCH /:source/:id/read', '200', 'success, notification'),
  @('POST /test', '201', 'success, notification'),
  @('PATCH /read-all', '200', 'success, updated_count')
)

$dbRows = @(
  @('ticketing_system.notifications', 'Ticket/general notifications, metadata columns, read state, recipient_user_id'),
  @('ticketing_system.analysis_notification_events', 'Analysis/report notifications, is_read, read_at, payload'),
  @('users.user_details', 'recipient_user_id foreign key added by metadata-column migration')
)

$errorRows = @(
  @('400', 'Invalid source or ID for mark-read endpoint'),
  @('401', 'Authentication required by router.use(auth)'),
  @('403', 'Non-admin user attempted to view or manage another user notifications'),
  @('404', 'Notification not found or does not belong to target user'),
  @('500', 'Unhandled database/server error')
)

$body = ''
$body += Para 'In-App Notifications API Documentation' 'Title' -Bold -Color '0B2545' -Size 36
$body += Para 'API reference for routes/inAppNotifications.routes.js, including listing merged notifications, marking read, creating test notifications, and read-all behavior.' 'Subtitle' -Color '4B5563' -Size 22
$body += Para 'Overview' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'The In-App Notifications API is an authenticated route group that combines ticket notifications with analysis/report notifications into one feed. It supports current-user access by default and admin-managed access through user_id.'
$body += Bullet 'Authentication: router.use(auth) applies to every endpoint.'
$body += Bullet 'Primary mount: /in-app-notifications'
$body += Bullet 'Alias mount: /notifications'
$body += Bullet 'Admin override: role admin, super admin, superadmin, or employee_id ADMIN001 can use user_id for another user.'
$body += Para 'Mount Paths' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Type', 'Base Path', 'Purpose') $mountRows @(1400, 2600, 5360)
$body += Para 'Endpoints' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Method', 'Endpoint', 'Purpose') $endpointRows @(900, 2800, 5660)
$body += Para 'List Notifications' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'GET / returns a merged feed from ticketing_system.notifications and ticketing_system.analysis_notification_events, ordered by created_at descending.'
$body += Table @('Parameter', 'Type', 'Description') $queryRows @(2200, 1600, 5560)
$body += Para 'Notification Response Fields' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Field', 'Type', 'Description') $notificationRows @(2500, 1600, 5260)
$body += Para 'List Request Example' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'GET /in-app-notifications?page=1&limit=20&unread_only=true&category=Tickets' 'Code'
$body += Para 'List Response Shape' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para '{ "notifications": [{ "source": "ticket", "id": 1, "notification_id": "NT-123", "ticket_id": "T-001", "type": "ASSIGNED", "category": "Tickets", "priority": "Medium", "status": "UNREAD", "is_unread": true, "title": "Ticket T-001", "body": "Assigned notification", "payload": { "ticket_id": "T-001" }, "created_at": "2026-06-10T00:00:00.000Z", "read_at": null }], "unread_count": 1, "pagination": { "page": 1, "limit": 20, "total": 1 } }' 'Code'
$body += Para 'Mark One Notification Read' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'PATCH /:source/:id/read marks a single notification as read. source must be ticket or analysis, and id must be the numeric internal row ID from the list response.'
$body += Bullet 'Ticket source updates ticketing_system.notifications.status to READ and sets read_at if missing.'
$body += Bullet 'Analysis source updates ticketing_system.analysis_notification_events.is_read to true and sets read_at if missing.'
$body += Para 'Request Example' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'PATCH /in-app-notifications/ticket/12/read' 'Code'
$body += Para 'Create Test Notification' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'POST /test creates a notification through utils/notifications.createNotification. It is useful for frontend notification UI checks and backend smoke tests.'
$body += Table @('Field', 'Type', 'Description') $testRows @(2200, 1600, 5560)
$body += Para 'Test Request Example' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'POST /in-app-notifications/test' 'Code'
$body += Para '{ "type": "TEST", "category": "System", "priority": "Medium", "title": "Test notification", "body": "This is a test app notification", "payload": { "demo": true } }' 'Code'
$body += Para 'Mark All Read' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'PATCH /read-all marks every unread ticket and analysis notification for the resolved user as read and returns the combined updated_count.'
$body += Para 'Response Summary' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Endpoint', 'Status', 'Main Fields') $responseRows @(3100, 1200, 5060)
$body += Para 'Database Tables' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Table', 'Usage') $dbRows @(3800, 5560)
$body += Para 'Error Responses' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Status', 'Meaning') $errorRows @(1200, 8160)
$body += Para 'Implementation Notes' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Bullet 'ensureNotificationMetadataColumns adds metadata columns, read_at, indexes, a primary key, and a unique notification_id index for ticket notifications.'
$body += Bullet 'GET / normalizes category filters: Ticket to Tickets, Report to Reports, and Threshold to Thresholds.'
$body += Bullet 'type/category/priority filters apply directly to ticket notifications and map to fixed analysis notification values.'
$body += Bullet 'The list API always returns unread_count for the target user regardless of the current page filter.'

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
  <dc:title>In-App Notifications API Documentation</dc:title>
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
