# setup_env.ps1 — uv 가상환경 + 의존성 + Jupyter 커널 등록
# 사용: PowerShell -ExecutionPolicy Bypass -File .\setup_env.ps1
$ErrorActionPreference = "Stop"

$slug        = "welfare-advisor"
$displayName = "Welfare Advisor (uv)"

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Write-Host "uv가 없습니다. 설치: powershell -c `"irm https://astral.sh/uv/install.ps1 | iex`"" -ForegroundColor Yellow
    exit 1
}

Write-Host "[1/3] uv venv 생성 (.venv)" -ForegroundColor Cyan
uv venv .venv

Write-Host "[2/3] 의존성 설치" -ForegroundColor Cyan
uv pip install --python .venv -r requirements.txt

Write-Host "[3/3] Jupyter 커널 등록: $slug-venv" -ForegroundColor Cyan
uv run --python .venv python -m ipykernel install --user --name "$slug-venv" --display-name "$displayName"

Write-Host "완료. 노트북에서 커널 '$displayName' 선택 후 Run All." -ForegroundColor Green
Write-Host ".env.example -> .env 복사 후 OPENAI_API_KEY 등을 채우세요." -ForegroundColor Green
