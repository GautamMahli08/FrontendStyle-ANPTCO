# deploy-local.ps1 — Windows local deploy script
# Builds the Lambda binary and uploads it with proper Unix execute permissions.
# Usage: .\scripts\deploy-local.ps1

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path $PSScriptRoot -Parent
$artifactDir = "$root\.aws-sam\build\CoreFunction"
$bootstrapPath = "$artifactDir\bootstrap"
$zipPath = "$root\bootstrap.zip"

Write-Host "Building binary..."
New-Item -ItemType Directory -Force $artifactDir | Out-Null
$env:CGO_ENABLED = "0"; $env:GOOS = "linux"; $env:GOARCH = "amd64"
go build -trimpath -ldflags="-s -w" -o $bootstrapPath "$root\cmd\lambda\" 2>&1
if ($LASTEXITCODE -ne 0) { throw "go build failed" }

Write-Host "Packaging with execute bit..."
python -c @"
import zipfile
info = zipfile.ZipInfo('bootstrap')
info.external_attr = 0o755 << 16
with zipfile.ZipFile(r'$zipPath', 'w', zipfile.ZIP_DEFLATED) as zf:
    with open(r'$bootstrapPath', 'rb') as f:
        zf.writestr(info, f.read())
print('ZIP ready')
"@

Write-Host "Updating Lambda function code..."
$fnName = (aws lambda list-functions --query "Functions[?starts_with(FunctionName,'anptco-core-api')].FunctionName" --output text)
aws lambda update-function-code `
    --function-name $fnName `
    --zip-file "fileb://$zipPath" `
    --query "{LastModified: LastModified, CodeSize: CodeSize}" `
    --output table

Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
Write-Host "Done. Also run 'sam deploy --config-file samconfig.toml --no-confirm-changeset' to sync CloudFormation (API routes etc)."
