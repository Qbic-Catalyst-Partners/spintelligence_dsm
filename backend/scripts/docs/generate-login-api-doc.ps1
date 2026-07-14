$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$docsApiDir = Join-Path $repoRoot 'docs\api'
$outPath = Join-Path $docsApiDir 'Login API Documentation.docx'
$tmp = Join-Path $repoRoot '__login_api_docx'

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
  @('POST', '/auth/login', 'Authenticate user with employee ID and password; returns JWT and user profile'),
  @('GET', '/auth/accessible-screens/:roleId', 'Return active accessible screens grouped by department for a role'),
  @('POST', '/auth/forgot-password', 'Validate phone number and return development OTP'),
  @('POST', '/auth/verify-otp', 'Validate static OTP and issue a reset token'),
  @('POST', '/auth/reset-password', 'Reset user password using reset token')
)

$loginRows = @(
  @('employee_id', 'string', 'Yes', 'Employee ID, trimmed before lookup'),
  @('password', 'string', 'Yes', 'Plain password compared with bcrypt password_hash')
)

$loginResponseRows = @(
  @('message', 'string', 'Login successful'),
  @('token', 'string', 'JWT signed with JWT_SECRET and expires in JWT_EXPIRES_IN or 24h'),
  @('user.id', 'number', 'User primary key'),
  @('user.employee_id', 'string', 'Employee ID'),
  @('user.full_name, email, phone', 'string', 'User profile fields'),
  @('user.level', 'string/number', 'User level'),
  @('user.role_id, role', 'number/string', 'Resolved active role details')
)

$tokenRows = @(
  @('sub', 'number', 'Authenticated user ID'),
  @('role_id', 'number', 'Resolved role ID'),
  @('role', 'string', 'Resolved role name'),
  @('employee_id', 'string', 'Employee ID'),
  @('level', 'string/number', 'User level')
)

$accessRows = @(
  @('roleId', 'path integer', 'Role ID to inspect'),
  @('Admin role behavior', 'special case', 'Role name admin receives every active screen for every active department'),
  @('Non-admin role behavior', 'RBAC mapping', 'Uses rbac.role_departments and rbac.role_screens')
)

$otpRows = @(
  @('forgot-password.phone', 'string', 'Required; must match users.user_details.phone'),
  @('verify-otp.phone', 'string', 'Required; must match +?[0-9]{10,15}'),
  @('verify-otp.otp', 'string', 'Required; development static OTP is 123456'),
  @('reset-password.resetToken', 'string', 'JWT issued by /verify-otp and signed with OTP_SECRET'),
  @('reset-password.newPassword', 'string', 'Required new password'),
  @('reset-password.confirmPassword', 'string', 'Must match newPassword')
)

$responseRows = @(
  @('POST /auth/login', '200', 'message, token, user'),
  @('GET /auth/accessible-screens/:roleId', '200', 'role_id, role_name, access[]'),
  @('POST /auth/forgot-password', '200', 'message, devOtp'),
  @('POST /auth/verify-otp', '200', 'message, resetToken'),
  @('POST /auth/reset-password', '200', 'message')
)

$dbRows = @(
  @('users.user_details', 'Login user lookup, account status, password_hash, phone lookup, password reset update'),
  @('rbac.role_details', 'Role lookup, active-role validation, admin role detection'),
  @('rbac.departments', 'Active department list for accessible screens'),
  @('rbac.screens', 'Active screen list for accessible screens'),
  @('rbac.role_departments', 'Department access mapping for non-admin roles'),
  @('rbac.role_screens', 'Screen access mapping for non-admin roles')
)

$envRows = @(
  @('JWT_SECRET', 'JWT signing secret for login access token; defaults to jwt_secret'),
  @('JWT_EXPIRES_IN', 'Login token expiry; defaults to 24h'),
  @('OTP_SECRET', 'Reset-token signing secret; defaults to otp_secret'),
  @('BCRYPT_SALT_ROUNDS', 'Password reset bcrypt rounds; defaults to 10')
)

$errorRows = @(
  @('400', 'Missing credentials, invalid phone format, missing OTP/reset fields, or password mismatch'),
  @('401', 'Invalid login credentials, invalid OTP token flow, or invalid/expired reset token'),
  @('403', 'Inactive user account, inactive/missing role, or inactive role for accessible screens'),
  @('404', 'Role not found, phone not found, or reset user not found'),
  @('500', 'Unhandled database/server error')
)

$body = ''
$body += Para 'Login API Documentation' 'Title' -Bold -Color '0B2545' -Size 36
$body += Para 'API reference for routes/login.js, including user login, accessible screens, development OTP, OTP verification, and password reset.' 'Subtitle' -Color '4B5563' -Size 22
$body += Para 'Overview' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'The Login API is mounted under /auth before the global auth middleware in server.js. It provides public authentication and password-reset endpoints plus role-based screen access lookup.'
$body += Bullet 'Base route: /auth'
$body += Bullet 'Content type: application/json for POST requests.'
$body += Bullet 'Server mount: server.js uses app.use("/auth", loginRouter) before app.use(auth).'
$body += Bullet 'Password hashes use bcrypt; login tokens use JWT.'
$body += Para 'Endpoints' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Method', 'Endpoint', 'Purpose') $endpointRows @(900, 3300, 5160)
$body += Para 'Login Request' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Field', 'Type', 'Required', 'Description') $loginRows @(1800, 1500, 1200, 4860)
$body += Para 'Login Request Example' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'POST /auth/login' 'Code'
$body += Para '{ "employee_id": "EMP005", "password": "Password123" }' 'Code'
$body += Para 'Login Response Fields' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Field', 'Type', 'Description') $loginResponseRows @(2600, 1600, 5160)
$body += Para 'JWT Claims' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Claim', 'Type', 'Description') $tokenRows @(1800, 1600, 5960)
$body += Para 'Accessible Screens' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'GET /auth/accessible-screens/:roleId validates the role and returns access grouped by department. Admin roles receive every active screen for every active department.'
$body += Table @('Item', 'Type', 'Description') $accessRows @(2400, 1800, 5160)
$body += Para 'Accessible Screens Response Shape' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para '{ "role_id": "1", "role_name": "Admin", "access": [{ "department_id": 1, "department_name": "Spinning", "screens": [{ "id": 1, "name": "COTS - CHECKING" }] }] }' 'Code'
$body += Para 'Password Reset / OTP Flow' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'The password reset flow is development-oriented. /forgot-password verifies that a phone exists and returns devOtp 123456. /verify-otp accepts the same static OTP and returns a 15-minute resetToken. /reset-password verifies that token and updates password_hash.'
$body += Table @('Field', 'Type', 'Description') $otpRows @(2600, 1700, 5060)
$body += Para 'OTP Flow Examples' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'POST /auth/forgot-password' 'Code'
$body += Para '{ "phone": "9876543210" }' 'Code'
$body += Para 'POST /auth/verify-otp' 'Code'
$body += Para '{ "phone": "9876543210", "otp": "123456" }' 'Code'
$body += Para 'POST /auth/reset-password' 'Code'
$body += Para '{ "resetToken": "jwt_token_here", "newPassword": "NewPass@123", "confirmPassword": "NewPass@123" }' 'Code'
$body += Para 'Response Summary' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Endpoint', 'Status', 'Main Fields') $responseRows @(3300, 1200, 4860)
$body += Para 'Database Tables' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Table', 'Usage') $dbRows @(2600, 6760)
$body += Para 'Environment Variables' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Variable', 'Purpose') $envRows @(2400, 6960)
$body += Para 'Error Responses' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Status', 'Meaning') $errorRows @(1200, 8160)
$body += Para 'Implementation Notes' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Bullet 'Login requires account_status to be Active and the assigned role to exist with status=true.'
$body += Bullet 'Password reset updates users.user_details.password_hash by phone from the verified reset token.'
$body += Bullet 'The OTP implementation currently uses the static development OTP 123456 and returns devOtp in the forgot-password response.'
$body += Bullet 'Accessible screens returns active departments only; non-admin roles can receive departments with empty screens when no active screen is mapped.'

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
  <dc:title>Login API Documentation</dc:title>
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
