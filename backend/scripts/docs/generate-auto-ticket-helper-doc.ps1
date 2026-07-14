$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$docsApiDir = Join-Path $repoRoot 'docs\api'
$outPath = Join-Path $docsApiDir 'Auto Ticket Helper Documentation.docx'
$tmp = Join-Path $repoRoot '__auto_ticket_helper_docx'

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

$functionRows = @(
  @('tryAutoGenerateTicket({ screenName, reqBody })', 'Main exported helper. Evaluates submitted values and inserts an operator ticket when needed.'),
  @('extractNumericMap(body)', 'Collects top-level numeric fields from the request body and skips metadata keys.'),
  @('evaluateBreach(actualRaw, rule)', 'Evaluates actual values against More Than, Less Than, or More and Less Than threshold rules.'),
  @('findByNormalizedKey(obj, key)', 'Finds object values by comparing normalized field names.')
)

$inputRows = @(
  @('screenName', 'string', 'Required. Must match threshold_master.input_screen.'),
  @('reqBody.department or reqBody.management_field', 'string', 'Required. Maps to threshold_master.department and operator_tickets.management_field.'),
  @('reqBody.sub_department or reqBody.erp_product_code', 'string', 'Required. Maps to threshold_master.sub_department and operator_tickets.erp_product_code.'),
  @('reqBody.machine_name, machine, machineno, machine_no', 'string', 'Required fallback chain. Defaults to screenName only after these fields.'),
  @('reqBody.user_name', 'string', 'Optional. Defaults to ERP System.'),
  @('numeric request fields', 'number/null', 'Evaluated as parameters. Metadata keys are ignored.')
)

$metaRows = @(
  @('department, sub_department, management_field, erp_product_code, input_screen', 'Request metadata; excluded from numeric checks.'),
  @('machine_name, machine, machineno, machine_no', 'Machine metadata; excluded from numeric checks.'),
  @('user_name, user_id', 'User metadata; excluded from numeric checks.'),
  @('inspection_date, entry_date, date, created_at, updated_at, status', 'Date/status metadata; excluded from numeric checks.'),
  @('entries, readings, summary, blends, items, results', 'Nested/grouped payload data; excluded from top-level numeric checks.')
)

$thresholdRows = @(
  @('department', 'Must match submitted department/management_field.'),
  @('sub_department', 'Must match submitted sub_department/erp_product_code.'),
  @('input_screen', 'Must match screenName.'),
  @('machine_name', 'Must match resolved machine name.'),
  @('is_active', 'Only active threshold rules are evaluated.'),
  @('input_field', 'Compared with submitted numeric field names using normalized key matching.'),
  @('condition_level', 'More Than, Less Than, or More and Less Than.'),
  @('plus_threshold, minus_threshold, actual_value', 'Used to calculate threshold breach rules.'),
  @('approval_l1_user_id, approval_l2_user_id, approval_l3_user_id', 'Copied into generated operator ticket approver fields.')
)

$conditionRows = @(
  @('More Than', 'Creates a breach when actual_value is greater than plus_threshold.'),
  @('Less Than', 'Creates a breach when actual_value is less than minus_threshold.'),
  @('More and Less Than', 'Creates a breach when actual_value is <= base actual_value - minus_threshold or >= base actual_value + plus_threshold.'),
  @('Invalid/non-numeric actual', 'Ignored for breach evaluation. Missing/null values are tracked separately.')
)

$reasonRows = @(
  @('MISSING_VALUE', 'One or more matched numeric fields are null, undefined, or blank.'),
  @('THRESHOLD_BREACH', 'One or more numeric values breach active threshold rules.'),
  @('BOTH', 'Payload contains both missing values and threshold breaches.'),
  @('No reason', 'Returns null and does not create a ticket.')
)

$insertRows = @(
  @('ticket_id', 'Generated as TK- plus ticketing_system.ticket_seq padded to 4 digits.'),
  @('user_name', 'Resolved user_name or ERP System.'),
  @('machine_name', 'Resolved machine name.'),
  @('parameter_name', 'JSON array of submitted numeric parameter names.'),
  @('actual_value', 'JSON object of submitted numeric values.'),
  @('threshold_value', 'JSON object of threshold rules by input_field.'),
  @('severity', 'High for missing values or 3+ breaches; otherwise Medium.'),
  @('status', 'Open.'),
  @('management_field', 'Department.'),
  @('erp_product_code', 'Sub-department.'),
  @('ticket_reason', 'MISSING_VALUE, THRESHOLD_BREACH, or BOTH.'),
  @('violation_details', 'JSON object with missing_fields and threshold_breaches.'),
  @('approval_l1/l2/l3_user_id(s)', 'Single primary approver and full approver arrays from threshold rules.')
)

$returnRows = @(
  @('ticket_id', 'Generated ticket ID when a ticket is created.'),
  @('severity', 'High or Medium.'),
  @('status', 'Open.'),
  @('null', 'Returned when required context, numeric fields, threshold rules, missing values, or breaches are absent.')
)

$dbRows = @(
  @('ticketing_system.threshold_master', 'Reads active threshold and approval rules.'),
  @('ticketing_system.operator_tickets', 'Inserts generated operator tickets.'),
  @('ticketing_system.ticket_seq', 'Generates TK ticket IDs.')
)

$body = ''
$body += Para 'Auto Ticket Helper Documentation' 'Title' -Bold -Color '0B2545' -Size 36
$body += Para 'Helper reference for automatic operator ticket generation in routes/autoTicketHelper.js.' 'Subtitle' -Color '4B5563' -Size 22
$body += Para 'Overview' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'autoTicketHelper.js is not an Express router. It exports tryAutoGenerateTicket(), a backend helper that evaluates submitted numeric form values against active threshold rules and creates an operator ticket when values are missing or out of range.'
$body += Bullet 'Export: module.exports = { tryAutoGenerateTicket }'
$body += Bullet 'Primary input: screenName and reqBody from a route handler.'
$body += Bullet 'Primary output: generated ticket summary or null.'
$body += Bullet 'Database writes: inserts into ticketing_system.operator_tickets only when a ticket reason is detected.'
$body += Para 'Functions' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Function', 'Purpose') $functionRows @(3600, 5760)
$body += Para 'Required Inputs' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Input', 'Type', 'Description') $inputRows @(3600, 1400, 4360)
$body += Para 'Ignored Metadata Keys' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'Only top-level numeric values are evaluated. These metadata/group keys are skipped before threshold evaluation.'
$body += Table @('Keys', 'Reason') $metaRows @(4200, 5160)
$body += Para 'Threshold Lookup' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'The helper reads active rules from ticketing_system.threshold_master using department, sub_department, input_screen, and machine_name.'
$body += Table @('Column', 'Use') $thresholdRows @(3100, 6260)
$body += Para 'Condition Evaluation' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Condition', 'Rule') $conditionRows @(2500, 6860)
$body += Para 'Ticket Reasons' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Reason', 'Meaning') $reasonRows @(2500, 6860)
$body += Para 'Generated Ticket Fields' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Field', 'Value') $insertRows @(2900, 6460)
$body += Para 'Return Shape' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Return Field', 'Description') $returnRows @(2200, 7160)
$body += Para 'Usage Example' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Para 'await tryAutoGenerateTicket({ screenName: "autoconerprocessparameter", reqBody: { department: "Production", sub_department: "Autoconer", machine_name: "AC-01", user_name: "ERP System", speed: 125 } });' 'Code'
$body += Para 'Database Tables' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Table @('Table', 'Purpose') $dbRows @(3600, 5760)
$body += Para 'Implementation Notes' 'Heading1' -Bold -Color '2E74B5' -Size 32
$body += Bullet 'Field matching is normalized by lowercasing and replacing whitespace with underscores.'
$body += Bullet 'Only numeric top-level fields and null values are considered as actual parameter values.'
$body += Bullet 'If no active threshold rules match the submitted context, the helper returns null.'
$body += Bullet 'If no submitted fields are missing or breached, the helper returns null.'
$body += Bullet 'Approver arrays are de-duplicated and filtered to positive integer user IDs.'
$body += Bullet 'The helper does not send notifications by itself; it only inserts the operator ticket.'

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
  <dc:title>Auto Ticket Helper Documentation</dc:title>
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
