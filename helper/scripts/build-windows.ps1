Write-Host "Building Windows EXE..."
npm install
npm run build:win
Write-Host "Copy the EXE to /opt/remote-support/packages/support-<SESSION_ID>.exe"
