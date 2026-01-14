# Deploy Script for SwitchBot Web App

Write-Host "📡 Syncing files to Raspberry Pi..." -ForegroundColor Cyan

# ファイル同期
scp -r ./src ./data package.json package-lock.json tsconfig.json next.config.mjs .env.local pi-user@pi4-sb1:~/switchbot-web-app/

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Sync failed." -ForegroundColor Red
    exit 1
}

Write-Host "✅ Sync complete." -ForegroundColor Green
Write-Host "🏗️ Starting remote build and restart..." -ForegroundColor Cyan

# リモートビルド＆再起動
ssh pi-user@pi4-sb1 "cd ~/switchbot-web-app && rm -rf .next && pm2 stop switchbot-app && npm run build && pm2 restart switchbot-app"

Write-Host "🚀 Deployment finished successfully!" -ForegroundColor Green
