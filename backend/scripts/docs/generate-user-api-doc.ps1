$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$docsApiDir = Join-Path $repoRoot 'docs\api'
$outPath = Join-Path $docsApiDir 'User API Documentation.docx'
$tmp = Join-Path $repoRoot '__user_api_docx'

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
  @('GET', '/users', 'List all users'),
  @('POST', '/users/add-user', 'Create a user with role and department validation'),
  @('PATCH', '/users/change-password/:id', 'Change a user password'),
  @('PATCH', '/users/:id', 'Update user profile, role, department, level, and DOB'),
  @('DELETE', '/users/:id', 'Delete a user'),
  @('PATCH', '/users/:id/account-status', 'Update account status'),
  @('POST', '/users/bulk-upload', 'Bulk upload users from CSV'),
  @('GET', '/users/export', 'Export users as CSV')
)

$createRows = @(
  @('first_name', 'string', 'Yes', 'User first name'),
  @('last_name', 'string', 'Yes', 'User last name'),
  @('email', 'string', 'Yes', 'Unique email'),
  @('phone', 'string', 'Yes', 'Unique phone'),
  @('employee_id', 'string', 'Yes', 'Employee code'),
  @('role', 'string', 'Yes', 'Role name; validated in rbac.role_details'),
  @('department', 'string', 'Yes', 'Department name; validated in rbac.departments'),
  @('designation', 'string', 'No', 'Designation text'),
  @('level', 'string', 'No', 'Normalized to L1, L2, or L3; defaults to L1'),
  @('dob', 'date/string', 'No', 'Date of birth'),
  @('password', 'string', 'Yes', 'Hashed with bcrypt before storage')
)

$updateRows = @(
  @('first_name, last_name', 'string', 'Name fields; full_name is returned but not recomputed in this route'),
  @('phone', 'string', 'Phone number'),
  @('role', 'string', 'Role name; updates role_id and role after validation'),
  @('department', 'string', 'Department name; updates department_id and department after validation'),
  @('level', 'string', 'Normalized to L1/L2/L3'),
  @('dob', 'date/string', 'Date of birth')
)

$bulkRows = @(
  @('file', 'multipart file', 'Required CSV file; max 10 MB'),
  @('Required CSV columns', 'email, phone, employee_id, first_name or full_name, role or role_id, department or department_id'),
  @('Optional CSV columns', 'last_name, designation, level, dob, account_status'),
  @('Default password', 'Password@123'),
  @('Duplicate behavior', 'Duplicate emails are skipped with ON CONFLICT (email) DO NOTHING'),
  @('Normalization', 'level to L1/L2/L3; account_status to Active/Inactive; full_name can split into first/last name')
)

$responseRows = @(
  @('GET /users', '200', 'Array of users with id, employee_id, full_name, email, phone, level, role, department, account_status, created_at'),
  @('POST /users/add-user', '201', 'message, user'),
  @('PATCH /users/change-password/:id', '200', 'message'),
  @('PATCH /users/:id', '200', 'message, user'),
  @('DELETE /users/:id', '200', 'message'),
  @('PATCH /users/:id/account-status', '200', 'message, user'),
  @('POST /users/bulk-upload', '200', 'message, processed, inserted, skipped'),
  @('GET /users/export', '200', 'text/csv attachment users.csv')
)

$tableRows = @(
  @('users.user_details', 'Main user profile, auth, role, department, level, DOB, and account status table'),
  @('rbac.role_details', 'Role validation and role_id lookup'),
  @('rbac.departments', 'Department validation and department_id lookup')
)

$errorRows = @(
  @('400', 'Missing required fields, invalid role/department, password mismatch, duplicate email/phone, CSV validation errors, or missing upload file'),
  @('404', 'User not found'),
  @('500', 'Unhandled database/server/export error')
)

$body = ''
$body += Para 'User API Documentation' 'Title' -Bold -Color '0B2545' -Size 36
$body += Para 'API reference for routes/user.routes.js, including user CRUD, password changes, account status updates, CSV bulk upload, and CSV export.' 'Subtitle' -Color '4B5563' -Size 22
$body += Para 'Overview' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'The User API is mounted under /users. It manages users.user_details records and validates role and department names against RBAC master tables when creating or updating users.'
$body += Bullet 'Base route: /users'
$body += Bullet 'Content type: application/json for normal create/update routes.'
$body += Bullet 'Bulk upload content type: multipart/form-data with file field named file.'
$body += Bullet 'Server mount: server.js uses app.use("/users", userRouter).'
$body += Para 'Endpoints' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Method', 'Endpoint', 'Purpose') $endpointRows @(900, 3300, 5160)
$body += Para 'Create User Payload' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Field', 'Type', 'Required', 'Description') $createRows @(2200, 1600, 1000, 4560)
$body += Para 'Update User Payload' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Field', 'Type', 'Description') $updateRows @(2600, 1600, 5160)
$body += Para 'Bulk Upload CSV' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Item', 'Details') $bulkRows @(2600, 6760)
$body += Para 'Response Summary' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Endpoint', 'Status', 'Main Fields') $responseRows @(3600, 1100, 4660)
$body += Para 'Request Examples' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'POST /users/add-user' 'Code'
$body += Para '{ "first_name": "Kevin", "last_name": "M", "email": "kevinm@example.com", "phone": "9876543210", "employee_id": "EMP024", "role": "Quality staff", "department": "Spinning", "level": "L2", "password": "Password@123" }' 'Code'
$body += Para 'PATCH /users/12/account-status' 'Code'
$body += Para '{ "account_status": "Inactive" }' 'Code'
$body += Para 'Database Tables' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Table', 'Usage') $tableRows @(3000, 6360)
$body += Para 'Error Responses' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Status', 'Meaning') $errorRows @(1200, 8160)
$body += Para 'Implementation Notes' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Bullet 'Passwords are hashed with bcrypt using saltRounds = 10.'
$body += Bullet 'normalizeUserLevel maps L2 and L3 explicitly; every other value becomes L1.'
$body += Bullet 'Create and profile-update routes wrap role/department validation and user writes in transactions.'
$body += Bullet 'Bulk upload accepts flexible CSV headers by normalizing header names to lowercase snake-style keys.'
$body += Bullet 'Export formats dob as YYYY-MM-DD and created_at as YYYY-MM-DD HH:mm:ss before generating users.csv.'

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
  <dc:title>User API Documentation</dc:title>
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
