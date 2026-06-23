# -*- coding: utf-8 -*-
"""
app.py — 복지 추천 LangGraph 엔진을 REST로 노출하는 FastAPI 래퍼.
에이전트 플로우(citizen_graph)를 그대로 구동하며, interrupt/resume 를
thread_id 기반으로 HTTP에 매핑한다.

엔드포인트
  GET  /health                 헬스체크
  GET  /                       서비스 정보
  POST /advise/start           폼 입력 → 매칭 카드 + (피드백) interrupt + thread_id
  POST /advise/resume          thread_id + 사용자 응답 → 다음 단계(재매칭/핸드오프/종료)
  POST /broadcast              지역/대상 → 마을 방송 대본 (Map-Reduce)
"""
import uuid
from typing import Optional, List, Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from langchain_core.messages import HumanMessage
from langgraph.types import Command

from welfare_graph import citizen_graph, broadcast_graph, DB

app = FastAPI(title="Welfare Advisor API", version="1.0",
              description="복지 직권주의 추천 — LangGraph 에이전트 엔진")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

# ---------------------------------------------------------------------
# 스키마
# ---------------------------------------------------------------------
class Form(BaseModel):
    gender: Optional[str] = None            # "M" | "F" | null
    birth_year: Optional[int] = None
    income_band: Optional[str] = None       # "50"|"75"|"100"|"200"|"over200"
    region_sido: Optional[str] = None
    region_sigungu: Optional[str] = None
    household_type: Optional[str] = None     # "single"|"general"|"multichild"
    housing_type: Optional[str] = None       # "own"|"jeonse"|"wolse"|"etc"
    checklist: List[str] = []                # disabled/perinatal/infant/single_parent/basic_recipient/near_poor
    consult_text: Optional[str] = None
    top: int = 6

class ResumeBody(BaseModel):
    thread_id: str
    action: Optional[str] = None             # "help" | "refine" | "done" | "send"
    text: Optional[str] = None

class BroadcastBody(BaseModel):
    region_sido: str
    region_sigungu: Optional[str] = None
    demographic: str = "elderly_rural"       # "elderly_rural" | "general"

# ---------------------------------------------------------------------
# 헬퍼
# ---------------------------------------------------------------------
def _interrupt(res) -> Optional[dict]:
    iv = res.get("__interrupt__") if isinstance(res, dict) else None
    if iv:
        v = iv[0].value
        return {"type": v.get("type"), "message": v.get("message"),
                "rendered": v.get("rendered"), "packet": v.get("packet")}
    return None

def _last_message(res) -> Optional[str]:
    msgs = (res or {}).get("messages") or []
    if msgs:
        return getattr(msgs[-1], "content", None)
    return None

def _shape(res, thread_id) -> dict:
    intr = _interrupt(res)
    return {
        "thread_id": thread_id,
        "done": intr is None,
        "cards": res.get("cards") or [],
        "interrupt": intr,
        "handoff_packet": res.get("handoff_packet"),
        "message": _last_message(res),
    }

# ---------------------------------------------------------------------
# 엔드포인트
# ---------------------------------------------------------------------
@app.get("/health")
def health():
    return {"status": "ok", "db_mode": DB.mode}

@app.get("/")
def root():
    return {
        "service": "Welfare Advisor API",
        "engine": "LangGraph (citizen + broadcast)",
        "endpoints": ["/health", "POST /advise/start", "POST /advise/resume", "POST /broadcast"],
    }

@app.post("/advise/start")
def advise_start(form: Form):
    """폼 입력 → intake→match→present. 카드 + 피드백 interrupt + thread_id 반환."""
    thread_id = str(uuid.uuid4())
    cfg = {"configurable": {"thread_id": thread_id}}
    initial = {
        "mode": "citizen",
        "messages": [HumanMessage(content="복지 추천 요청")],
        "form": form.model_dump(),
        "feedback_round": 0,
    }
    res = citizen_graph.invoke(initial, config=cfg)
    return _shape(res, thread_id)

@app.post("/advise/resume")
def advise_resume(body: ResumeBody):
    """피드백 처리: action=refine(text로 재검색)/help(핸드오프)/done(종료)/send(핸드오프 전송)."""
    cfg = {"configurable": {"thread_id": body.thread_id}}
    resume_val = {"action": body.action or "done", "text": body.text or ""}
    res = citizen_graph.invoke(Command(resume=resume_val), config=cfg)
    return _shape(res, body.thread_id)

@app.post("/broadcast")
def broadcast(body: BroadcastBody):
    """지역 대표 프로필 → 적합 제도 5건 → Map-Reduce 멘트 → 마을 방송 대본."""
    res = broadcast_graph.invoke({
        "region": {"sido": body.region_sido, "sigungu": body.region_sigungu},
        "demographic": body.demographic, "segments": [],
    })
    return {
        "script": res.get("script"),
        "benefits": [c.get("service_name") for c in (res.get("benefits") or [])],
    }
