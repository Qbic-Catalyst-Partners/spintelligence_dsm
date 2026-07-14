$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$docsApiDir = Join-Path $repoRoot 'docs\api'
$outPath = Join-Path $docsApiDir 'Dashboard API Documentation.docx'
$tmp = Join-Path $repoRoot '__dashboard_api_docx'

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
  @('Primary', '/dashboard', 'Main dashboard API mount'),
  @('API alias', '/api/dashboard', 'Frontend/API compatibility mount'),
  @('Settings alias', '/api/dashboard-settings', 'Dashboard settings compatibility mount'),
  @('Builder alias', '/dashbuilder', 'Dashbuilder compatibility mount'),
  @('Builder alias', '/builder', 'Builder compatibility mount'),
  @('Analytics alias', '/statistics-analytics', 'Rewrites to dashboard statistics handlers')
)

$endpointRows = @(
  @('GET', '/builder/options', 'Legacy builder dropdown options'),
  @('GET', '/builder/options/v2', 'Builder options with grouped metadata'),
  @('GET', '/builder/options/cascade', 'Cascade options for department, sub-department, notebook, and fields'),
  @('GET', '/builder/options/all', 'Alias for cascade options'),
  @('GET', '/builder/options/match', 'Match input screen to available schema/catalog fields'),
  @('GET', '/builder/widgets/:userId', 'Read saved widgets for a user'),
  @('POST', '/builder/widgets/:userId', 'Save or replace widgets for a user'),
  @('PATCH', '/builder/widgets/:userId/reorder', 'Reorder widgets by ID'),
  @('PATCH', '/builder/widgets/:userId/:widgetId/toggle', 'Toggle a widget enabled flag'),
  @('DELETE', '/builder/widgets/:userId/:widgetId', 'Delete a widget'),
  @('GET', '/builder/data', 'Preview data for one widget field'),
  @('GET', '/builder/statistics-analytics/filters', 'Fetch filter values for statistics analytics'),
  @('GET', '/builder/statistics-analytics', 'Fetch trend and summary analytics for a field'),
  @('GET', '/builder/my-page', 'Return effective dashboard page data for current user')
)

$unifiedRows = @(
  @('GET', '/my-widgets', 'Read current user widget configuration'),
  @('POST', '/my-widgets', 'Save current user widget configuration'),
  @('GET', '/my-dashboard', 'Read current or manager-selected dashboard data'),
  @('GET', '/statistics-analytics/filters', 'Fetch statistics analytics filter options'),
  @('GET', '/statistics-analytics/options', 'Alias for statistics analytics filters'),
  @('GET', '/statistics-analytics', 'Fetch statistics analytics values'),
  @('GET', '/page', 'Alias for current dashboard page data'),
  @('GET', '/pages/my', 'List current user dashboard pages'),
  @('GET', '/pages/my/:pageKey', 'Read current user dashboard page configuration'),
  @('GET', '/pages/my/:pageKey/data', 'Read page widgets with computed data'),
  @('POST', '/pages/my/:pageKey', 'Save current user dashboard page'),
  @('DELETE', '/pages/my/:pageKey', 'Delete current user dashboard page except default'),
  @('POST', '/pages/assign/:userId/:pageKey', 'Assign a dashboard page to another user')
)

$dashbuilderAliasRows = @(
  @('GET', '/dashbuilder/options', 'Alias for /builder/options'),
  @('GET', '/dashbuilder/options/v2', 'Alias for /builder/options/v2'),
  @('GET', '/dashbuilder/options/cascade', 'Alias for /builder/options/cascade'),
  @('GET', '/dashbuilder/options/all', 'Alias for /builder/options/all'),
  @('GET', '/dashbuilder/options/match', 'Alias for /builder/options/match'),
  @('GET', '/dashbuilder/:userId/widgets', 'Alias for reading user widgets'),
  @('POST', '/dashbuilder/:userId/add-widget', 'Alias for saving user widgets'),
  @('POST', '/dashbuilder/:userId/add-ticket', 'Alias for saving ticket widgets'),
  @('PATCH', '/dashbuilder/:userId/reorder-widgets', 'Alias for widget reorder'),
  @('PATCH', '/dashbuilder/:userId/widgets/:widgetId/toggle', 'Alias for widget toggle'),
  @('DELETE', '/dashbuilder/:userId/widgets/:widgetId', 'Alias for widget delete'),
  @('GET', '/dashbuilder/data', 'Alias for /builder/data'),
  @('GET', '/dashbuilder/pages/my/:pageKey/data', 'Alias for page data'),
  @('POST', '/dashbuilder/pages/assign/:userId/:pageKey', 'Alias for page assignment')
)

$widgetFieldRows = @(
  @('id', 'string', 'Optional; generated as widget-{timestamp} when omitted'),
  @('department', 'string', 'Required for data widgets'),
  @('sub_department', 'string', 'Required for data widgets'),
  @('input_screen', 'string', 'Required for data widgets; normalized before table lookup'),
  @('input_field', 'string', 'Required for data widgets; must resolve to a numeric field for charts/cards'),
  @('visualization_type', 'string', 'average_value_card, bar_chart, area_chart, line_chart, individual_ticket_count, add_ticket_count, or ticket_status_card'),
  @('metric_key', 'string', 'Required for ticket_status_card: total, open, closed, reopened, pending, or overdue'),
  @('widget_name', 'string', 'Optional display label; defaults for add ticket widgets'),
  @('enabled', 'boolean', 'Defaults to true; disabled widgets are hidden from dashboard data'),
  @('order', 'number', 'Set by save/reorder handlers from the request order')
)

$queryRows = @(
  @('department', 'string', 'Required by field analytics and option-match requests'),
  @('sub_department', 'string', 'Required by field analytics and cascade requests'),
  @('input_screen or notebook', 'string', 'Screen/notebook key used to resolve the source table'),
  @('input_field', 'string', 'Numeric source column for widget data or analytics'),
  @('period', 'string', '1D, 1W, 1M, 1Y for dashboard data; analytics also supports 3M, 6M, 1Q, CUSTOM'),
  @('fromDate/start_date', 'date/string', 'Required when period=CUSTOM for statistics analytics'),
  @('toDate/end_date', 'date/string', 'Required when period=CUSTOM for statistics analytics'),
  @('user_id/view_user_id', 'number', 'Manager-only override to view another user dashboard')
)

$responseRows = @(
  @('Options', 'departments, sub_departments, input_screens, fields', 'Used by dashboard builder dropdowns'),
  @('Widget config', 'user_id, widgets, updated_at', 'Returned by widget save/read APIs'),
  @('Widget data', 'filter, average_value, latest_value, latest_at, trend', 'Returned by single-widget preview data API'),
  @('Dashboard page data', 'user_id, page_key, page_title, widgets, data', 'Returned by page and my-dashboard APIs'),
  @('Statistics analytics', 'filter, summary, trend, records', 'Returned by statistics analytics API'),
  @('Page config', 'user_id, page_key, page_title, widgets, is_active', 'Returned by page configuration APIs')
)

$errorRows = @(
  @('400', 'Invalid or missing query/path/body data such as userId, widgets, period, widget_ids, or pageKey'),
  @('401', 'Authentication required; all dashboard routes use auth middleware'),
  @('403', 'Read-only access or forbidden cross-user dashboard access'),
  @('404', 'Dashboard user, widget, or page not found'),
  @('500', 'Unhandled database or server error passed to Express error middleware')
)

$body = ''
$body += Para 'Dashboard API Documentation' 'Title' -Bold -Color '0B2545' -Size 36
$body += Para 'API reference for dashboard builder options, widget configuration, statistics analytics, dashboard pages, and compatibility aliases in routes/dashboard.js.' 'Subtitle' -Color '4B5563' -Size 22
$body += Para 'Overview' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'The Dashboard API is an authenticated route group that supports dashboard-builder dropdowns, widget CRUD, computed dashboard cards/charts, statistics analytics, and per-user dashboard pages. The same router is mounted under multiple aliases for frontend compatibility.'
$body += Bullet 'Authentication: router.use(auth) applies to every dashboard route.'
$body += Bullet 'Content type: application/json for all POST/PATCH requests.'
$body += Bullet 'Manager behavior: ADMIN001-style dashboard managers can assign or view dashboards for other users; ordinary users can read their own dashboard and have read-only access to builder mutations.'
$body += Para 'Mount Paths' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Type', 'Base Path', 'Purpose') $mountRows @(1600, 2500, 5260)
$body += Para 'Builder Endpoints' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Method', 'Endpoint', 'Purpose') $endpointRows @(900, 3600, 4860)
$body += Para 'Unified Dashboard Endpoints' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Method', 'Endpoint', 'Purpose') $unifiedRows @(900, 3600, 4860)
$body += Para 'Dashbuilder Compatibility Aliases' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Method', 'Endpoint', 'Purpose') $dashbuilderAliasRows @(900, 3900, 4560)
$body += Para 'Widget Payload' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'Widget save APIs expect a JSON body with a widgets array. Each item is validated and normalized before storage.'
$body += Table @('Field', 'Type', 'Description') $widgetFieldRows @(2200, 1600, 5560)
$body += Para 'Save Widgets Example' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'POST /dashboard/my-widgets' 'Code'
$body += Para '{ "widgets": [{ "department": "Production", "sub_department": "Autoconer", "input_screen": "autoconerprocessparameter", "input_field": "speed", "visualization_type": "average_value_card", "widget_name": "Autoconer Speed" }] }' 'Code'
$body += Para 'Common Query Parameters' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Parameter', 'Type', 'Description') $queryRows @(2500, 1600, 5260)
$body += Para 'Response Families' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Response', 'Main Fields', 'Used By') $responseRows @(1900, 3400, 4060)
$body += Para 'Dashboard Page Workflow' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Bullet 'Use GET /dashboard/pages/my to list saved pages for the authenticated user.'
$body += Bullet 'Use POST /dashboard/pages/my/:pageKey with page_title, is_active, and widgets to save a page.'
$body += Bullet 'Use GET /dashboard/pages/my/:pageKey/data to load computed widget data for a specific page.'
$body += Bullet 'Use POST /dashboard/pages/assign/:userId/:pageKey to assign a page to another user when the requester has manager access.'
$body += Para 'Analytics Workflow' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Bullet 'Use /statistics-analytics/filters to populate department, sub_department, notebook/input_screen, and field selectors.'
$body += Bullet 'Use /statistics-analytics with department, sub_department, input_screen, input_field, and period to fetch trend data.'
$body += Bullet 'Use period=CUSTOM with fromDate/start_date and toDate/end_date for a custom date range.'
$body += Para 'Error Responses' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Status', 'Meaning') $errorRows @(1200, 8160)
$body += Para 'Implementation Notes' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Bullet 'Widget configuration is stored in users.dashboard_builder_configs.'
$body += Bullet 'Dashboard pages are stored in users.user_dashboard_pages and synchronized back to builder configs for legacy screens.'
$body += Bullet 'Numeric widget fields are resolved through information_schema and quoted before query execution.'
$body += Bullet 'Ticket count widgets support total, open, closed, reopened, pending, and overdue metrics.'
$body += Bullet 'Supported sub-departments include Mixing, Spinning, Carding, Comber, Blowroom, Autoconer, Drawframe, and Simplex.'

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
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="120" w:line="280" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="120"/></w:pPr><w:rPr><w:b/><w:color w:val="0B2545"/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:color w:val="4B5563"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="320" w:after="160"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="2E74B5"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Bullet"><w:name w:val="Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="80" w:line="280" w:lineRule="auto"/></w:pPr></w:style>
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
  <dc:title>Dashboard API Documentation</dc:title>
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
