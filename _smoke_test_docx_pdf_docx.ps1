$ErrorActionPreference = 'Stop'
$temp = Join-Path $env:TEMP 'scrapestack-docx-test'
Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $temp | Out-Null
New-Item -ItemType Directory -Path (Join-Path $temp '_rels') | Out-Null
New-Item -ItemType Directory -Path (Join-Path $temp 'word') | Out-Null
New-Item -ItemType Directory -Path (Join-Path $temp 'word/_rels') | Out-Null
@'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>
'@ | Set-Content -Encoding UTF8 (Join-Path $temp '[Content_Types].xml')
@'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
'@ | Set-Content -Encoding UTF8 (Join-Path $temp '_rels/.rels')
@'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Hello ScrapeStack</w:t></w:r></w:p>
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>
  </w:body>
</w:document>
'@ | Set-Content -Encoding UTF8 (Join-Path $temp 'word/document.xml')
@'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>
'@ | Set-Content -Encoding UTF8 (Join-Path $temp 'word/_rels/document.xml.rels')
$docx = Join-Path $env:TEMP 'scrapestack-test.docx'
Remove-Item $docx -Force -ErrorAction SilentlyContinue
Compress-Archive -Path (Join-Path $temp '*') -DestinationPath $docx -Force
Write-Host "DOCX created: $docx"
$json = curl.exe -s -X POST -F "file=@$docx" http://206.189.85.232:3001/convert/doc-to-pdf
Write-Host "doc-to-pdf response: $json"
$downloadUrl = ($json | ConvertFrom-Json).downloadUrl
if (-not $downloadUrl) { throw 'Missing downloadUrl from doc-to-pdf response' }
$pdf = Join-Path $env:TEMP 'scrapestack-test.pdf'
Remove-Item $pdf -Force -ErrorAction SilentlyContinue
curl.exe -s "http://206.189.85.232:3001$downloadUrl" -o $pdf
if (-not (Test-Path $pdf)) { throw 'PDF download failed' }
Write-Host "PDF downloaded: $pdf"
$json2 = curl.exe -s -X POST -F "file=@$pdf" http://206.189.85.232:3001/convert/pdf-to-docx
Write-Host "pdf-to-docx response: $json2"
