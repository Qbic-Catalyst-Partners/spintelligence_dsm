$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$docsApiDir = Join-Path $repoRoot 'docs\api'
$outPath = Join-Path $docsApiDir 'Help Content API Documentation.docx'
$tmp = Join-Path $repoRoot '__help_content_api_docx'

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
  @('/help', 'Primary help content mount'),
  @('/glossary', 'Alias that rewrites requests to /help/glossary'),
  @('/faqs', 'Alias that rewrites requests to /help/faqs'),
  @('/user-guide', 'Alias that rewrites requests to /help/user-guide')
)

$endpointRows = @(
  @('GET', '/help/glossary', 'List glossary entries with grouping, alphabet counts, and category options'),
  @('GET', '/help/glossary/categories', 'List glossary category options'),
  @('POST', '/help/glossary', 'Create glossary entry; admin only'),
  @('PATCH', '/help/glossary/:id', 'Update glossary entry; admin only'),
  @('DELETE', '/help/glossary/:id', 'Soft-delete glossary entry; admin only'),
  @('GET', '/help/faqs', 'List FAQs grouped by category'),
  @('GET', '/help/faqs/categories', 'List FAQ categories'),
  @('POST', '/help/faqs', 'Create FAQ; admin only'),
  @('PATCH', '/help/faqs/:id', 'Update FAQ; admin only'),
  @('DELETE', '/help/faqs/:id', 'Soft-delete FAQ; admin only'),
  @('GET', '/help/user-guide', 'List user guide entries grouped by section'),
  @('GET', '/help/user-guide/categories', 'List user guide sections/categories'),
  @('GET', '/help/user-guide/:slug', 'Get one active guide by slug'),
  @('POST', '/help/user-guide', 'Create user guide entry; admin only'),
  @('PATCH', '/help/user-guide/:id', 'Update user guide entry; admin only'),
  @('DELETE', '/help/user-guide/:id', 'Soft-delete user guide entry; admin only')
)

$queryRows = @(
  @('include_inactive', 'boolean string', 'When true, includes inactive records in list/category responses'),
  @('category', 'string', 'Glossary/FAQ category filter; all disables category filtering'),
  @('section', 'string', 'User guide section filter; all disables section filtering'),
  @('letter', 'A-Z or #', 'Glossary first-letter filter'),
  @('department', 'string', 'Glossary department filter'),
  @('sub_department / subDepartment', 'string', 'Glossary sub-department filter'),
  @('input_screen / notebook', 'string', 'Glossary input screen filter'),
  @('input_field', 'string', 'Glossary input field filter'),
  @('search / q', 'string', 'Free-text search for glossary, FAQ, or guide lists')
)

$glossaryRows = @(
  @('input_field', 'string', 'Yes', 'Source field/key for the glossary term'),
  @('description', 'string', 'Yes', 'Definition text'),
  @('display_name', 'string', 'No', 'Friendly term shown as term/title'),
  @('category', 'string', 'No', 'Glossary category'),
  @('department, sub_department, input_screen', 'string', 'No', 'Optional context fields'),
  @('example_value, unit', 'string', 'No', 'Optional example and unit'),
  @('is_active', 'boolean/string', 'No', 'Defaults true; false values soft-hide the entry')
)

$faqRows = @(
  @('question', 'string', 'Yes', 'FAQ question'),
  @('answer', 'string', 'Yes', 'FAQ answer'),
  @('category', 'string', 'No', 'Defaults to Getting Started when absent'),
  @('display_order', 'number', 'No', 'Sort order within category; defaults to 0'),
  @('is_active', 'boolean/string', 'No', 'Defaults true')
)

$guideRows = @(
  @('title / question', 'string', 'Yes', 'Guide title'),
  @('content / answer / description', 'string', 'Yes', 'Guide content'),
  @('slug', 'string', 'No', 'Generated from title when omitted'),
  @('section / category', 'string', 'No', 'Defaults to Getting Started when absent'),
  @('display_order', 'number', 'No', 'Sort order within section; defaults to 0'),
  @('is_active', 'boolean/string', 'No', 'Defaults true')
)

$responseRows = @(
  @('GET /glossary', 'glossary, terms, grouped_glossary, alphabet, categories, total_terms, filtered_terms'),
  @('GET /faqs', 'faqs, data, faq_sections, grouped_faqs, categories, active_category, totals'),
  @('GET /user-guide', 'guides, data, guide_sections, grouped_guides, categories, sections, active_section, totals'),
  @('GET /user-guide/:slug', 'guide'),
  @('POST/PATCH create-update routes', 'success plus glossary_entry, faq, or guide'),
  @('DELETE soft-delete routes', 'success plus id/is_active payload')
)

$tableRows = @(
  @('ticketing_system.glossary_entries', 'Glossary entries, category/context fields, active status, audit users'),
  @('ticketing_system.faq_entries', 'FAQ question/answer records, category, display order, active status'),
  @('ticketing_system.user_guide_entries', 'Guide title, slug, content, section, display order, active status')
)

$errorRows = @(
  @('400', 'Missing required fields or invalid numeric ID/slug input'),
  @('403', 'Non-admin attempted create/update/delete'),
  @('404', 'Glossary, FAQ, or user guide entry not found'),
  @('409', 'Guide slug already exists'),
  @('500', 'Unhandled database/server error')
)

$body = ''
$body += Para 'Help Content API Documentation' 'Title' -Bold -Color '0B2545' -Size 36
$body += Para 'API reference for routes/helpContent.routes.js, including glossary, FAQs, user guide entries, categories, grouping responses, and admin-only content management.' 'Subtitle' -Color '4B5563' -Size 22
$body += Para 'Overview' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'The Help Content API is an authenticated route group mounted under /help, with convenience aliases for /glossary, /faqs, and /user-guide. It serves read-friendly grouped content for the frontend and restricts content management to admin users.'
$body += Bullet 'Authentication: all endpoints run after router.use(auth).'
$body += Bullet 'Admin/editor access: create, update, and delete require admin, super admin, superadmin, or employee ID ADMIN001.'
$body += Bullet 'Delete operations are soft deletes that set is_active = false.'
$body += Bullet 'Server aliases rewrite /glossary, /faqs, and /user-guide to the matching /help paths.'
$body += Para 'Route Mounts' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Base Route', 'Purpose') $mountRows @(3000, 6360)
$body += Para 'Endpoints' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Method', 'Endpoint', 'Purpose') $endpointRows @(900, 3900, 4560)
$body += Para 'List Query Parameters' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Parameter', 'Type', 'Description') $queryRows @(2700, 1800, 4860)
$body += Para 'Glossary Payload Fields' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Field', 'Type', 'Required', 'Description') $glossaryRows @(2600, 1700, 1000, 4060)
$body += Para 'FAQ Payload Fields' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Field', 'Type', 'Required', 'Description') $faqRows @(2600, 1700, 1000, 4060)
$body += Para 'User Guide Payload Fields' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Field', 'Type', 'Required', 'Description') $guideRows @(2600, 1700, 1000, 4060)
$body += Para 'Response Summary' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Endpoint', 'Main Fields') $responseRows @(3400, 5960)
$body += Para 'Request Examples' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'GET /help/glossary?category=Spinning&letter=S&search=speed' 'Code'
$body += Para 'POST /help/faqs' 'Code'
$body += Para '{ "question": "How do I acknowledge a ticket?", "answer": "Open the ticket and use the acknowledge action.", "category": "Tickets", "display_order": 1 }' 'Code'
$body += Para 'POST /help/user-guide' 'Code'
$body += Para '{ "title": "Dashboard Builder", "content": "Create widgets and arrange them on your dashboard.", "section": "Dashboard" }' 'Code'
$body += Para 'Database Tables' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Table', 'Usage') $tableRows @(3600, 5760)
$body += Para 'Error Responses' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Status', 'Meaning') $errorRows @(1200, 8160)
$body += Para 'Implementation Notes' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Bullet 'Glossary responses map display_name/input_field into term and title aliases and group results by alphabet letter.'
$body += Bullet 'FAQ responses map question/answer into title/content aliases and group entries by category.'
$body += Bullet 'User guide responses map title/content into question/answer aliases and group entries by section.'
$body += Bullet 'parseBool accepts true/1/yes/active and false/0/no/inactive for is_active values.'
$body += Bullet 'POST /user-guide generates a URL slug from title when slug is omitted.'

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
  <dc:title>Help Content API Documentation</dc:title>
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
