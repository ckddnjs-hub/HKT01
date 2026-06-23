#!/usr/bin/env bash
# setup_env.sh — uv 가상환경 + 의존성 + Jupyter 커널 등록
# 사용: bash setup_env.sh
set -euo pipefail

SLUG="welfare-advisor"
DISPLAY_NAME="Welfare Advisor (uv)"

# uv 미설치 시 안내
if ! command -v uv >/dev/null 2>&1; then
  echo "uv가 없습니다. 설치: curl -LsSf https://astral.sh/uv/install.sh | sh"
  exit 1
fi

echo "[1/3] uv venv 생성 (.venv)"
uv venv .venv

echo "[2/3] 의존성 설치"
uv pip install --python .venv -r requirements.txt

echo "[3/3] Jupyter 커널 등록: ${SLUG}-venv"
uv run --python .venv python -m ipykernel install --user \
  --name "${SLUG}-venv" --display-name "${DISPLAY_NAME}"

echo "완료. 노트북을 열고 커널 '${DISPLAY_NAME}' 선택 후 Run All."
echo "다음으로 .env.example → .env 복사 후 OPENAI_API_KEY 등을 채우세요."
