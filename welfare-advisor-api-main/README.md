# 복지 직권주의 추천 API (Welfare Proactive Advisor)

신청주의 사각지대를 줄이는 **LangGraph 하이브리드** 에이전트를 REST API로 서비스. 코어(복지 DB · 결정론 자격 게이트 · 의도추출 · 쉬운말 변환)를 두 그래프가 공유.

- **시민 그래프**: 폼 입력 → `intake`(폼→profile) → `match`(Supabase `match_welfare` RPC: 하드게이트→정밀 스코어링→전체 풀 랭킹) → `present`(피드백 루프) → `handoff`(복지사 전달, HITL)
- **방송 그래프**: 지역 demographic → 적합 제도 선별 → Map-Reduce(`Send()`) 멘트 → 마을 방송 대본

> 핵심 차별점: 단순 RAG가 아니라 **연령·소득·성별 하드 게이트 + 특성 플래그 스코어 + 의도 분야/키워드 랭킹**.

## 구성
- `app.py` — FastAPI 래퍼 (그래프를 HTTP interrupt/resume 로 노출)
- `welfare_graph.py` — LangGraph 엔진 (노드/그래프/데이터계층)
- `welfare_advisor.ipynb` — 동일 로직 노트북(개발/시연용)
- `Dockerfile`, `railway.toml` — Railway 배포
- `requirements.txt`, `.env.example`

## 로컬 실행
```bash
pip install -r requirements.txt
cp .env.example .env   # 값 채우기 (OPENAI_API_KEY, SUPABASE_URL/SERVICE_KEY 필수)
uvicorn app:app --reload --port 8000
# http://localhost:8000/health
```

## API
| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/health` | 헬스체크 (`db_mode` 포함) |
| POST | `/advise/start` | 폼 payload → 추천 카드 + 피드백 interrupt + `thread_id` |
| POST | `/advise/resume` | `thread_id` + 응답(action: refine/help/done/send) → 다음 단계 |
| POST | `/broadcast` | 지역/대상 → 마을 방송 대본 |

### 예시
```bash
curl -X POST $URL/advise/start -H 'Content-Type: application/json' -d '{
  "gender":"F","birth_year":1954,"income_band":"50",
  "region_sido":"대전광역시","region_sigungu":"서구",
  "household_type":"single","housing_type":"wolse",
  "checklist":["basic_recipient","single_parent"],
  "consult_text":"당뇨가 있고 일자리를 찾고 있어요"
}'
# → { thread_id, cards:[...], interrupt:{type:"feedback",...} }

curl -X POST $URL/advise/resume -H 'Content-Type: application/json' \
  -d '{"thread_id":"<위 값>","action":"help","text":"신청을 모르겠어요"}'
```
폼 필드 규약은 `../복지데이터/_supabase_적재/welfare_form_spec.md` 참고.

## 데이터 / 매칭
- `welfare_services`(~15,528) / `welfare_support_conditions`(~15,525) — Supabase. 매칭은 `match_welfare(jsonb)` RPC.
- CSV 폴백: `WELFARE_CSV_DIR` 지정 시 동일 로직을 파이썬으로 수행(서버 기본은 Supabase).

## 배포 (Railway)
GitHub 레포 연결 → 환경변수(.env.example 항목) 등록 → 빌드(Dockerfile). 헬스체크 `/health`.
프록시 헤더(`--proxy-headers --forwarded-allow-ips="*"`)는 `railway.toml`/`Dockerfile`에 반영됨.
