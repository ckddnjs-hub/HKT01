FROM python:3.11-slim

WORKDIR /app

# 빌드 의존성 (일부 휠 컴파일 대비)
RUN apt-get update && apt-get install -y --no-install-recommends gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# railway.toml startCommand 가 이 CMD를 덮어쓰지만, 단독 실행 대비 동일 옵션 유지
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000} --forwarded-allow-ips=* --proxy-headers"]
