# -*- coding: utf-8 -*-
"""
welfare_graph.py — 복지 직권주의 추천 LangGraph 엔진 (서비스용 모듈).
welfare_advisor.ipynb 의 코어를 임포트 가능한 형태로 정리.
서버(app.py)가 citizen_graph / broadcast_graph 를 그대로 구동한다.
"""
import os
import json
import operator
from typing import TypedDict, Annotated, Optional
from datetime import date

from dotenv import load_dotenv

for _envfile in ("_env", ".env", "env.txt"):
    if os.path.exists(_envfile):
        load_dotenv(_envfile, override=True)
        break

from pydantic import BaseModel, Field
from langchain.chat_models import init_chat_model
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.types import interrupt, Command, Send
from langgraph.checkpoint.memory import MemorySaver

# ---------------------------------------------------------------------
# LLM + observability
# ---------------------------------------------------------------------
MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
llm = init_chat_model(MODEL, temperature=0)
try:
    from langfuse.langchain import CallbackHandler
    CALLBACKS = [CallbackHandler()]
except Exception:
    CALLBACKS = []

def ask_llm(messages):
    return llm.invoke(messages, config={"callbacks": CALLBACKS})

# ---------------------------------------------------------------------
# 상수
# ---------------------------------------------------------------------
CHARACTERISTIC_FLAGS = [
    "multi_cultural", "north_korean_defector", "single_parent", "single_household",
    "multi_child", "no_house", "expecting_parent", "pregnant", "postpartum",
    "farmer", "fisher", "livestock", "forester", "elementary", "middle_school",
    "high_school", "university", "employed", "unemployed", "disabled", "veteran", "illness",
]
INCOME_BANDS = ["50", "75", "100", "200", "over200"]
CONSULT_FLAGS = [
    "multi_cultural", "north_korean_defector", "farmer", "fisher", "livestock",
    "forester", "veteran", "illness", "employed", "unemployed",
]
SERVICE_FIELDS = [
    "생활안정", "생활지원", "서민금융", "농림축산어업", "보육·교육", "보육", "교육",
    "보건·의료", "신체건강", "임신·출산", "입양·위탁", "고용·창업", "일자리",
    "문화·환경", "문화·여가", "에너지", "보호·돌봄", "행정·안전", "주거·자립",
    "주거", "안전·위기",
]

class WelfareState(TypedDict):
    messages: Annotated[list, add_messages]
    mode: str
    form: dict
    profile: dict
    candidates: list
    cards: list
    feedback_round: int
    handoff_needed: bool
    handoff_packet: Optional[dict]

class BroadcastState(TypedDict):
    region: dict
    demographic: str
    benefits: list
    benefit: dict
    segments: Annotated[list, operator.add]
    script: str

# ---------------------------------------------------------------------
# 데이터 계층 (Supabase RPC 우선, CSV 폴백)
# ---------------------------------------------------------------------
def _truthy(v):
    if isinstance(v, bool):
        return v
    return str(v).strip().lower() in ("true", "1", "t", "y", "yes")

def _na(v):
    if v is None:
        return ""
    if isinstance(v, float):
        try:
            import math
            if math.isnan(v):
                return ""
        except Exception:
            pass
    s = str(v).strip()
    return "" if s.lower() == "nan" else s

ID_COLS = {"service_id": str}

class WelfareDB:
    def __init__(self):
        self.mode = None
        self.sb = None
        self.svc = None
        self.cond = None
        url = os.getenv("SUPABASE_URL")
        key = (os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY")
               or os.getenv("SUPABASE_KEY"))
        if url and key:
            try:
                from supabase import create_client
                self.sb = create_client(url, key)
                self.mode = "supabase"
                print("WelfareDB: Supabase 연결됨 (match_welfare RPC)")
            except Exception as e:
                print(f"WelfareDB: Supabase 실패({e}) → CSV 폴백")
        if self.mode != "supabase":
            import pandas as pd
            self._pd = pd
            d = os.getenv("WELFARE_CSV_DIR", "./data")
            self.svc = pd.read_csv(f"{d}/welfare_services_rows.csv", dtype=ID_COLS, low_memory=False)
            self.cond = pd.read_csv(f"{d}/welfare_support_conditions_rows.csv", dtype=ID_COLS, low_memory=False)
            bool_cols = (CHARACTERISTIC_FLAGS + ["male_eligible", "female_eligible"]
                         + [f"income_band_{b}" for b in INCOME_BANDS])
            for c in bool_cols:
                if c in self.cond.columns:
                    self.cond[c] = self.cond[c].map(_truthy)
            for c in ("age_start", "age_end"):
                if c in self.cond.columns:
                    self.cond[c] = pd.to_numeric(self.cond[c], errors="coerce")
            self.mode = "csv"
            print(f"WelfareDB: CSV 로드 ({len(self.svc)} services / {len(self.cond)} conditions)")

    def match(self, profile, top=6):
        if self.mode == "supabase":
            p = dict(profile); p["top"] = top
            try:
                rows = self.sb.rpc("match_welfare", {"p": p}).execute().data or []
                return cards_from_rpc(rows, top)
            except Exception as e:
                print(f"RPC 실패({e}) → CSV 폴백 시도")
                if self.svc is None:
                    return []
        gated = self.gate(profile, limit=150)
        region = profile.get("region") or {"sido": profile.get("region_sido")}
        svc_map = self.fetch_services([g["service_id"] for g in gated], region=region)
        return build_cards(gated, svc_map, profile.get("service_fields"),
                           keywords=profile.get("keywords"), top=top)

    def _cond_candidates(self, profile):
        income = profile.get("income_band"); gender = profile.get("gender")
        df = self.cond
        m = self._pd.Series(True, index=df.index)
        if income and f"income_band_{income}" in df.columns:
            m &= df[f"income_band_{income}"]
        if gender == "M":
            m &= df["male_eligible"]
        if gender == "F":
            m &= df["female_eligible"]
        return df[m].to_dict("records")

    def gate(self, profile, limit=150):
        pd = self._pd
        age = profile.get("age"); chars = set(profile.get("characteristics") or [])
        out = []
        for r in self._cond_candidates(profile):
            a0, a1 = r.get("age_start"), r.get("age_end")
            if age is not None and pd.notna(a0) and pd.notna(a1):
                try:
                    if not (int(float(a0)) <= age <= int(float(a1))):
                        continue
                except (TypeError, ValueError):
                    pass
            svc_chars = {f for f in CHARACTERISTIC_FLAGS if _truthy(r.get(f))}
            matched = chars & svc_chars
            spec = len(svc_chars); narrow = 0 < spec <= 6
            if chars and narrow and not matched:
                continue
            out.append({"service_id": str(r.get("service_id")), "matched": sorted(matched),
                        "narrow": narrow, "income_checked": bool(profile.get("income_band")),
                        "age_checked": age is not None, "score": 1 + len(matched) * 2})
        out.sort(key=lambda x: -x["score"])
        return out[:limit]

    def fetch_services(self, ids, region=None):
        ids = [str(i) for i in ids]
        rows = self.svc[self.svc["service_id"].isin(ids)].to_dict("records")
        sido = (region or {}).get("sido")
        out = {}
        for s in rows:
            rs = _na(s.get("region_sido"))
            if rs and sido and rs != sido:
                continue
            s["_local"] = bool(rs)
            out[str(s.get("service_id"))] = s
        return out

# ---------------------------------------------------------------------
# 카드/지역/말투/폼/상담 헬퍼
# ---------------------------------------------------------------------
def _clip(s, n=240):
    s = _na(s).replace("\r", " ").replace("\n", " ").strip()
    return s[:n] + ("…" if len(s) > n else "")

def _confidence(meta):
    if meta["income_checked"] and meta["age_checked"] and (meta["matched"] or not meta["narrow"]):
        return "확실"
    if meta["income_checked"] or meta["age_checked"]:
        return "조건부"
    return "참고"

def cards_from_rpc(rows, top=6):
    cards = []
    for rank, r in enumerate(rows[:top], 1):
        cards.append({
            "rank": rank,
            "service_name": _na(r.get("service_name")),
            "field": _na(r.get("service_field")),
            "local": bool(r.get("is_local")),
            "support": _clip(r.get("support_content")),
            "apply_method": _clip(r.get("apply_method"), 120) or "주민센터 방문/문의",
            "receiving_agency": _na(r.get("receiving_agency")) or "주민센터",
            "contact": _na(r.get("contact")),
            "deadline": _clip(r.get("apply_deadline"), 80) or "상시",
            "detail_url": _na(r.get("detail_url")),
            "confidence": _na(r.get("confidence")) or "참고",
            "matched": r.get("matched") or [],
        })
    return cards

def build_cards(gated, svc_map, service_fields, keywords=None, top=6):
    want = {f.replace(" ", "") for f in (service_fields or [])}
    kws = [k.strip() for k in (keywords or []) if k and k.strip()]
    rows = []
    for g in gated:
        s = svc_map.get(g["service_id"])
        if not s:
            continue
        sf = {x.replace(" ", "") for x in _na(s.get("service_field")).split(",") if x.strip()}
        field_hit = len(want & sf)
        blob = (_na(s.get("service_name")) + " " + _na(s.get("service_summary")) + " "
                + _na(s.get("support_content"))).lower()
        kw_hit = sum(1 for k in kws if k.lower() in blob)
        rel = field_hit * 6 + kw_hit * 3 + (3 if s.get("_local") else 0) + g["score"] * 0.05
        rows.append((rel, field_hit + kw_hit, g, s))
    if want or kws:
        hits = [r for r in rows if r[1] > 0]
        rows = hits if len(hits) >= 3 else rows
    rows.sort(key=lambda x: -x[0])
    cards = []
    for rank, (rel, fh, g, s) in enumerate(rows[:top], 1):
        cards.append({
            "rank": rank, "service_name": _na(s.get("service_name")),
            "field": _na(s.get("service_field")), "local": bool(s.get("_local")),
            "support": _clip(_na(s.get("support_content")) or s.get("service_summary")),
            "apply_method": _clip(s.get("apply_method"), 120) or "주민센터 방문/문의",
            "receiving_agency": _na(s.get("receiving_agency")) or "주민센터",
            "contact": _na(s.get("contact")),
            "deadline": _clip(s.get("apply_deadline"), 80) or "상시",
            "detail_url": _na(s.get("detail_url")),
            "confidence": _confidence({**g, "matched": g["matched"]}),
            "matched": g["matched"],
        })
    return cards

def render_cards(cards, dialect=None):
    lines = []
    for c in cards:
        tag = "🏠우리동네 " if c["local"] else ""
        lines.append(
            f"[{c['rank']}] {tag}{c['service_name']}  ({c['confidence']})\n"
            f"   - 지원: {c['support']}\n"
            f"   - 신청: {c['apply_method']} / 접수처: {c['receiving_agency']}\n"
            f"   - 문의: {c['contact']}  마감: {c['deadline']}\n"
            f"   - 자세히: {c['detail_url']}")
    return "\n".join(lines) if lines else "(조건에 맞는 제도를 찾지 못했어요)"

DIALECT_MAP = {
    "충청남도": "충청도", "충청북도": "충청도", "대전광역시": "충청도", "세종특별자치시": "충청도",
    "경상남도": "경상도", "경상북도": "경상도", "대구광역시": "경상도", "부산광역시": "경상도", "울산광역시": "경상도",
    "전라남도": "전라도", "전라북도": "전라도", "전북특별자치도": "전라도", "광주광역시": "전라도",
    "강원특별자치도": "강원도", "제주특별자치도": "제주도",
}
SIDO_LIST = [
    "서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시", "대전광역시", "울산광역시",
    "세종특별자치시", "경기도", "강원특별자치도", "충청북도", "충청남도", "전북특별자치도",
    "전라남도", "경상북도", "경상남도", "제주특별자치도", "강원도", "전라북도",
]
SIDO_ALIAS = {
    "서울": "서울특별시", "부산": "부산광역시", "대구": "대구광역시", "인천": "인천광역시",
    "광주": "광주광역시", "대전": "대전광역시", "울산": "울산광역시", "세종": "세종특별자치시",
    "경기": "경기도", "강원": "강원특별자치도", "충북": "충청북도", "충남": "충청남도",
    "전북": "전북특별자치도", "전남": "전라남도", "경북": "경상북도", "경남": "경상남도", "제주": "제주특별자치도",
}

def parse_region(text):
    import re
    t = (text or "").strip()
    sido = next((s for s in SIDO_LIST if s in t), None)
    if not sido:
        for short, full in SIDO_ALIAS.items():
            if short in t:
                sido = full; break
    rest = t.replace(sido, "") if sido else t
    m = re.search(r"([가-힣]+(?:시|군|구))", rest)
    return {"sido": sido, "sigungu": m.group(1) if m else None}

def _dialect(state):
    prof = state.get("profile") or {}
    sido = prof.get("region_sido") or (prof.get("region") or {}).get("sido") \
           or (state.get("region") or {}).get("sido")
    return DIALECT_MAP.get(sido)

def easy_translate(text, dialect=None):
    sys = ("당신은 복지 안내문을 어르신도 한 번에 이해하도록 아주 쉬운 말로 바꿔주는 도우미입니다. "
           "짧은 존댓말 문장, 어려운 한자어는 풀어쓰고, 숫자·신청처·문의처는 또렷하게 반복하세요.")
    if dialect:
        sys += f" 너무 과하지 않게 {dialect} 말투를 살짝 입혀 친근하게 해주세요."
    return ask_llm([SystemMessage(content=sys), HumanMessage(content=text)]).content

def build_profile_from_form(form):
    chars, lifes = set(), set()
    age = None
    by = form.get("birth_year")
    if by:
        try:
            age = date.today().year - int(by)
        except (TypeError, ValueError):
            age = None
    income = form.get("income_band") or None
    cl = set(form.get("checklist") or [])
    if "basic_recipient" in cl:
        income = "50"
    elif "near_poor" in cl and income != "50":
        income = "75"
    ht = form.get("household_type")
    if ht == "single":
        chars.add("single_household")
    elif ht == "multichild":
        chars.add("multi_child")
    if form.get("housing_type") in ("jeonse", "wolse", "etc"):
        chars.add("no_house")
    if "disabled" in cl:
        chars.add("disabled")
    if "perinatal" in cl:
        chars.update(["expecting_parent", "pregnant", "postpartum"])
    if "single_parent" in cl:
        chars.add("single_parent")
    if "infant" in cl:
        lifes.add("영유아")
    sido = form.get("region_sido") or None
    sigungu = form.get("region_sigungu") or None
    return {
        "gender": form.get("gender") or None, "age": age, "income_band": income,
        "region_sido": sido, "region_sigungu": sigungu,
        "region": {"sido": sido, "sigungu": sigungu},
        "characteristics": sorted(chars), "life_stages": sorted(lifes),
        "service_fields": [], "keywords": [], "needs_text": "",
    }

class ConsultExtract(BaseModel):
    service_fields: list[str] = Field(default_factory=list,
        description=f"관련 복지 분야(여러 개 가능): {SERVICE_FIELDS}")
    keywords: list[str] = Field(default_factory=list, description="핵심 필요 키워드 3~6개")
    characteristics: list[str] = Field(default_factory=list,
        description=f"문장에서 드러난 특성만. 다음 중에서: {CONSULT_FLAGS}")

def extract_consult(consult_text):
    if not consult_text:
        return {"service_fields": [], "keywords": [], "characteristics": []}
    out = llm.with_structured_output(ConsultExtract).invoke(
        [SystemMessage(content="복지 상담 문장에서 분야·키워드·해당 특성을 추출하세요. 특성은 제시된 목록에 있는 것만."),
         HumanMessage(content=consult_text)], config={"callbacks": CALLBACKS})
    return {"service_fields": out.service_fields, "keywords": out.keywords,
            "characteristics": out.characteristics}

def merge_consult(profile, consult):
    p = dict(profile)
    p["service_fields"] = sorted(set(p.get("service_fields") or []) | set(consult.get("service_fields") or []))
    p["keywords"] = sorted(set(p.get("keywords") or []) | set(consult.get("keywords") or []))
    p["characteristics"] = sorted(set(p.get("characteristics") or []) | set(consult.get("characteristics") or []))
    return p

def build_packet(state):
    prof = state.get("profile") or {}
    cards = state.get("cards") or []
    return {
        "민원인_요약": {
            "지역": prof.get("region"), "연령": prof.get("age"),
            "소득구간": prof.get("income_band"), "특성": prof.get("characteristics"),
            "필요": prof.get("needs_text"),
        },
        "추천제도": [{"제도명": c["service_name"], "접수처": c["receiving_agency"],
                       "문의": c["contact"], "확신도": c["confidence"]} for c in cards[:5]],
        "막힌_지점": state.get("_stuck", "신청 방법을 어려워함(디지털 취약)"),
    }

def send_handoff(packet):
    print("=== [복지 담당자 전달] ===")
    print(json.dumps(packet, ensure_ascii=False, indent=2))

# ---------------------------------------------------------------------
# 시민 그래프 노드
# ---------------------------------------------------------------------
DB = WelfareDB()

def intake(state: WelfareState):
    form = dict(state.get("form") or {})
    if not form.get("region_sido"):
        ans = interrupt({"type": "region_input",
                         "message": "어느 지역에 사세요? '시/도 시군구'로 알려주세요. (예: 대전광역시 서구)"})
        if isinstance(ans, dict):
            ans = ans.get("text", "")
        rg = parse_region(str(ans))
        form["region_sido"] = rg.get("sido"); form["region_sigungu"] = rg.get("sigungu")
    profile = build_profile_from_form(form)
    ct = form.get("consult_text")
    if ct:
        try:
            profile = merge_consult(profile, extract_consult(ct))
            profile["needs_text"] = ct
        except Exception as e:
            print(f"consult 추출 스킵: {e}")
    return {"form": form, "profile": profile}

def match(state: WelfareState):
    cards = DB.match(state["profile"], top=6)
    return {"candidates": cards, "cards": cards}

def present(state: WelfareState):
    rendered = render_cards(state.get("cards") or [], dialect=_dialect(state))
    fb = interrupt({
        "type": "feedback", "rendered": rendered, "cards": state.get("cards"),
        "message": "추천을 보여드렸어요. ① 신청이 어려우면 '도와줘' ② 더 필요한 걸 말로 알려주시면 다시 찾아드려요 ③ 괜찮으면 '완료'.",
    })
    if isinstance(fb, str):
        fb = {"action": "refine", "text": fb}
    action = (fb or {}).get("action", "done")
    if action == "help":
        return Command(goto="handoff",
                       update={"handoff_needed": True,
                               "_stuck": fb.get("text", "신청 방법을 어려워함(디지털 취약)")})
    if action == "refine" and state.get("feedback_round", 0) < 3:
        prof = dict(state["profile"])
        txt = fb.get("text", "")
        try:
            prof = merge_consult(prof, extract_consult(txt))
        except Exception:
            pass
        prof["needs_text"] = ((prof.get("needs_text") or "") + " | " + txt).strip(" |")
        return Command(goto="match",
                       update={"profile": prof, "feedback_round": state.get("feedback_round", 0) + 1})
    msg = "추천을 마칩니다. 신청이 막히면 가까운 동 주민센터나 복지로(☎ 129)로 문의하실 수 있어요."
    return Command(goto=END, update={"messages": [AIMessage(content=msg)]})

def handoff(state: WelfareState):
    packet = build_packet(state)
    approve = interrupt({
        "type": "handoff_approve", "packet": packet,
        "message": "아래 내용을 복지 담당자에게 전달할까요? (개인정보 포함) '예(send)' 또는 수정/취소를 알려주세요.",
    })
    if isinstance(approve, dict) and approve.get("action") == "send":
        send_handoff(packet)
        note = "담당자에게 전달했어요. 곧 연락드릴 거예요. 조금만 기다려 주세요."
    else:
        note = "전달은 보류했어요. 원하실 때 다시 도와드릴게요."
    return {"handoff_packet": packet,
            "messages": [AIMessage(content=easy_translate(note, dialect=_dialect(state)))]}

# ---------------------------------------------------------------------
# 시민 그래프 빌드 (서버: MemorySaver 로 interrupt 재개)
# ---------------------------------------------------------------------
_builder = StateGraph(WelfareState)
_builder.add_node("intake", intake)
_builder.add_node("match", match)
_builder.add_node("present", present)
_builder.add_node("handoff", handoff)
_builder.add_edge(START, "intake")
_builder.add_edge("intake", "match")
_builder.add_edge("match", "present")
_builder.add_edge("handoff", END)
checkpointer = MemorySaver()
citizen_graph = _builder.compile(checkpointer=checkpointer)

# ---------------------------------------------------------------------
# 방송 그래프 (Map-Reduce)
# ---------------------------------------------------------------------
REP_PROFILE = {
    "elderly_rural": {"age": 73, "income_band": "50", "characteristics": ["single_household", "farmer"]},
    "general":      {"age": 45, "income_band": "100", "characteristics": []},
}

def bregion(state: BroadcastState):
    demo = state.get("demographic", "elderly_rural")
    prof = dict(REP_PROFILE.get(demo, REP_PROFILE["general"]))
    prof["region_sido"] = (state["region"] or {}).get("sido")
    prof["region_sigungu"] = (state["region"] or {}).get("sigungu")
    prof["region"] = state["region"]
    return {"benefits": DB.match(prof, top=8)}

def bselect(state: BroadcastState):
    ranked = sorted(state["benefits"],
                    key=lambda c: (c["local"], c["confidence"] == "확실"), reverse=True)
    return {"benefits": ranked[:5]}

def fan_out(state: BroadcastState):
    return [Send("bdraft", {"benefit": b, "region": state["region"],
                            "demographic": state.get("demographic", "")})
            for b in state["benefits"]]

def bdraft(state: BroadcastState):
    b = state["benefit"]
    dialect = DIALECT_MAP.get((state["region"] or {}).get("sido"))
    sys = ("마을 스피커로 어르신들께 읽어드릴 30초 분량 복지 안내 멘트를 만드세요. "
           "짧고 또렷한 문장, 제도명·대상·신청처·문의 전화를 분명히. ")
    if dialect:
        sys += f"{dialect} 말투를 살짝 입혀 정겹게."
    text = (f"제도명:{b['service_name']} / 지원:{b['support']} / "
            f"접수처:{b['receiving_agency']} / 문의:{b['contact']}")
    seg = ask_llm([SystemMessage(content=sys), HumanMessage(content=text)]).content
    return {"segments": [f"📢 {seg}"]}

def bassemble(state: BroadcastState):
    region = state["region"]
    head = f"안녕하십니까, {region.get('sigungu','우리')} 주민 여러분. 오늘의 복지 소식입니다."
    tail = "이상 복지 소식이었습니다. 신청은 가까운 주민센터에서 도와드립니다. 고맙습니다."
    return {"script": "\n\n".join([head] + state["segments"] + [tail])}

_bb = StateGraph(BroadcastState)
_bb.add_node("bregion", bregion)
_bb.add_node("bselect", bselect)
_bb.add_node("bdraft", bdraft)
_bb.add_node("bassemble", bassemble)
_bb.add_edge(START, "bregion")
_bb.add_edge("bregion", "bselect")
_bb.add_conditional_edges("bselect", fan_out, ["bdraft"])
_bb.add_edge("bdraft", "bassemble")
_bb.add_edge("bassemble", END)
broadcast_graph = _bb.compile()
