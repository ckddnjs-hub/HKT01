'use strict';
// ══════════════════════════════════════════════════════════════════════
//  core.js — 앱 초기화 · 라우팅 · Supabase · 공통 유틸
// ══════════════════════════════════════════════════════════════════════

// ── 설정 (Vercel 환경변수로 주입하거나 직접 입력) ──────────────────────
const SUPABASE_URL  = 'https://hgnzljnjjzhcybqseikx.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhnbnpsam5qanpoY3licXNlaWt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MjUzODksImV4cCI6MjA5NjIwMTM4OX0.qYu-Oj9QASMiHG5qPhzVB0plPvEZXPO1PGkr6QGBz5w';
const RAILWAY_URL   = 'https://welfare-village-broadcaster-production.up.railway.app';
// 복지 어드바이저 API(LangGraph /advise/start·/advise/resume) — Vercel 환경변수 ADVISOR_URL 로 덮어씀
let ADVISOR_URL     = 'https://welfare-advisor-api-production.up.railway.app';
// 카카오 지도 JS 앱키 — Vercel 의 KAKAO_MAP_KEY 환경변수로 덮어씀 (없으면 아래 폴백 사용)
let KAKAO_KEY       = '77ab39b1d04918d710e164d4c908b376';
// 웹푸시(VAPID) 공개키 — 비공개키는 Vercel 환경변수 PUSH_KEY (서버리스에서 사용)
const VAPID_PUBLIC_KEY = 'BEGPZAvkXbZXmo7zu8GgFGi_C9cHE2XMf9fkENJ17w-AdTiU-dcNAtBj7xULHciWGGLeNUiY9wH3-BLOK9P0vLI';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

let ME = null;          // Supabase User
let MY_PROFILE = null;  // profiles 테이블 row
let currentPage = '';

// ── 앱 초기화 ──────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  // Vercel 환경변수에서 카카오 키 주입 (배포 환경) — 실패하면 하드코딩 폴백 사용
  try {
    const cfg = await fetch('/api/config').then(r => r.ok ? r.json() : null);
    if (cfg?.kakaoKey) KAKAO_KEY = cfg.kakaoKey;
    if (cfg?.advisorUrl) ADVISOR_URL = cfg.advisorUrl.replace(/\/$/, '');
  } catch (_) { /* 로컬/오프라인: 폴백 키 사용 */ }

  // PWA 서비스워커 등록 + 업데이트 시 자동 새로고침
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data?.type === 'SW_UPDATED') window.location.reload();
    });
  }

  // Supabase 익명 로그인 (실패해도 앱은 동작)
  try {
    let { data: { session } } = await sb.auth.getSession();
    if (!session) {
      const { data } = await sb.auth.signInAnonymously();
      session = data?.session ?? null;
    }
    ME = session?.user ?? null;
    if (ME) {
      const { data } = await sb.from('profiles').select('*').eq('id', ME.id).single();
      if (data) MY_PROFILE = data;
    }
  } catch (e) {
    console.warn('Supabase 연결 실패, 오프라인 모드로 진행:', e.message);
  }
  // Supabase 실패 시 localStorage에서 복원
  if (!MY_PROFILE) {
    try {
      const stored = localStorage.getItem('my_profile');
      if (stored) MY_PROFILE = JSON.parse(stored);
    } catch (_) {}
  }

  // 로딩 화면 제거
  const ls = document.getElementById('loading-screen');
  ls.classList.add('hidden');
  setTimeout(() => ls.remove(), 500);

  document.body.classList.add('ready');
  document.getElementById('app').classList.add('show');

  // 온보딩 여부에 따라 첫 화면 결정
  if (!MY_PROFILE?.onboarding_done) {
    navigateTo('wizard');
  } else {
    navigateTo('dashboard');
    updateHeaderAvatar();
  }
});

// ── 테마 ──────────────────────────────────────────────────────────────
function _applyTheme(mode) {
  const isLight = mode === 'light';
  document.body.classList.toggle('light', isLight);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = isLight ? '🌑' : '🌙';
  const meta = document.getElementById('meta-theme-color');
  // 헤더 그라데이션 시작색(=primary)과 맞춰 상태바도 같은 톤으로
  if (meta) meta.content = isLight ? '#0f7b6c' : '#3bb6e6';
}
function toggleTheme() {
  const next = document.body.classList.contains('light') ? 'dark' : 'light';
  localStorage.setItem('theme', next);
  _applyTheme(next);
}
// 저장된 테마 즉시 적용 (기본값: 라이트 모드)
_applyTheme(localStorage.getItem('theme') || 'light');

function setTheme(mode) {
  localStorage.setItem('theme', mode);
  _applyTheme(mode);
  if (currentPage === 'profile') renderProfilePage();
}

// ── 글자 크기 조절 (html 기준 rem 스케일) ─────────────────────────────
function _applyFontScale(px) {
  document.documentElement.style.fontSize = (px || 16) + 'px';
}
function setFontScale(px) {
  localStorage.setItem('font_scale', String(px));
  _applyFontScale(px);
  if (currentPage === 'profile') renderProfilePage();
}
_applyFontScale(parseInt(localStorage.getItem('font_scale')) || 16);

// ── 푸시 알림 ON/OFF ─────────────────────────────────────────────────
async function setPush(on) {
  if (on) {
    await requestPushPermission();
  } else {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      if (ME) { try { await sb.from('push_subscriptions').delete().eq('user_id', ME.id); } catch (_) {} }
    } catch (_) {}
    localStorage.setItem('push_enabled', '0');
    localStorage.removeItem('push_subscription');
    toast('알림을 껐어요');
  }
  if (currentPage === 'profile') renderProfilePage();
}

// ── 이름/닉네임 저장 ─────────────────────────────────────────────────
async function saveProfileName(v) {
  await saveProfile({ name: (v || '').trim() });
  toast('이름을 저장했어요', 'success');
  updateHeaderAvatar();
}

// ── 라우팅 ────────────────────────────────────────────────────────────
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.bottom-nav-item').forEach(n => n.classList.remove('active'));

  const el = document.getElementById('page-' + page);
  if (el) el.classList.add('active');
  document.getElementById('nav-' + page)?.classList.add('active');
  document.getElementById('app-body').scrollTop = 0;

  currentPage = page;

  switch (page) {
    case 'dashboard': renderDashboard(); break;
    case 'strategy':  renderStrategy();  break;
    case 'chat':      renderChat();      break;
    case 'calendar':  renderCalendar();  break;
    case 'profile':   renderProfilePage(); break;
    case 'wizard':    renderWizard();    break;
  }
}

// ── 프로필 저장 ───────────────────────────────────────────────────────
async function saveProfile(updates) {
  // localStorage에 항상 저장 (오프라인/익명 미지원 환경 대응)
  const merged = { ...(MY_PROFILE || {}), ...updates };
  try { localStorage.setItem('my_profile', JSON.stringify(merged)); } catch (_) {}
  MY_PROFILE = merged;

  // Supabase에도 저장 (로그인된 경우)
  if (!ME) return { data: merged, error: null };
  const payload = { id: ME.id, ...updates, updated_at: new Date().toISOString() };
  const { data, error } = await sb.from('profiles').upsert(payload).select().single();
  if (!error && data) MY_PROFILE = data;
  return { data, error };
}

// ── 헤더 아바타 업데이트 ──────────────────────────────────────────────
function updateHeaderAvatar() {
  const el = document.getElementById('hdr-avatar');
  if (!el || !MY_PROFILE) return;
  el.textContent = MY_PROFILE.gender === 'female' ? '👩' : '👨';
}

// ── 내정보 페이지 렌더 ───────────────────────────────────────────────
function renderProfilePage() {
  const el = document.getElementById('page-profile');
  if (!el) return;
  const p = MY_PROFILE;
  const age = p?.birth_year ? new Date().getFullYear() - p.birth_year : '-';
  const householdLabel = { single:'1인 가구', couple:'부부', family:'자녀포함 가족', single_parent:'한부모 가정', other:'기타' };
  const housingLabel   = { own:'자가', jeonse:'전세', monthly_rent:'월세', public:'공공임대', other:'기타' };

  const lightOn = document.body.classList.contains('light');
  const pushOn  = localStorage.getItem('push_enabled') === '1';
  const fs      = parseInt(localStorage.getItem('font_scale')) || 16;

  el.innerHTML = `
    <div style="padding:24px 16px 0;text-align:center">
      <div class="profile-avatar">${p?.gender === 'female' ? '👩' : '👨'}</div>
      <div style="font-size:1rem;font-weight:900;margin-bottom:4px">${esc(p?.name) || `${age}세 ${p?.gender === 'female' ? '여성' : '남성'}`}</div>
      <div style="font-size:.83rem;color:var(--text-muted);margin-bottom:16px">${esc(p?.address || p?.region || '지역 미입력')}</div>
    </div>
    <div class="profile-section">

      <div class="section-title">내 정보 (수정 가능)</div>
      <div class="card">
        <label class="modal-label">이름 / 닉네임</label>
        <div style="display:flex;gap:8px">
          <input type="text" id="pf-name-input" class="pf-input" style="flex:1" placeholder="이름을 입력하세요"
            value="${esc(p?.name || '')}" onkeydown="if(event.key==='Enter')saveProfileName(this.value)">
          <button class="btn btn-primary" onclick="saveProfileName(document.getElementById('pf-name-input').value)">저장</button>
        </div>
      </div>
      <div class="card" style="padding:0 16px">
        ${profileRow('거주 지역', p?.address || p?.region || '-')}
        ${profileRow('가구 구성', householdLabel[p?.household_type] || '-')}
        ${profileRow('가구 소득', p?.income_amount ? `월 ${p.income_amount}만원` : '-')}
        ${profileRow('중위소득', p?.income_level ? `${p.income_level}%` : '-')}
        ${profileRow('거주 형태', housingLabel[p?.housing_type] || '-')}
      </div>
      <button class="btn btn-outline btn-full" style="margin-top:8px" onclick="navigateTo('wizard')">✏️ 상세 정보 다시 입력</button>

      <div class="section-title">설정</div>
      <div class="card">
        <div class="set-row">
          <span class="set-label">화면 모드</span>
          <div class="seg">
            <button class="btn btn-sm ${lightOn ? 'btn-primary' : 'btn-outline'}" onclick="setTheme('light')">☀️ 라이트</button>
            <button class="btn btn-sm ${!lightOn ? 'btn-primary' : 'btn-outline'}" onclick="setTheme('dark')">🌙 다크</button>
          </div>
        </div>
        <div class="set-row">
          <span class="set-label">푸시 알림</span>
          <div class="seg">
            <button class="btn btn-sm ${pushOn ? 'btn-primary' : 'btn-outline'}" onclick="setPush(true)">ON</button>
            <button class="btn btn-sm ${!pushOn ? 'btn-primary' : 'btn-outline'}" onclick="setPush(false)">OFF</button>
          </div>
        </div>
        <div class="set-row">
          <span class="set-label">글자 크기</span>
          <div class="seg">
            <button class="btn btn-sm ${fs === 16 ? 'btn-primary' : 'btn-outline'}" onclick="setFontScale(16)">보통</button>
            <button class="btn btn-sm ${fs === 18 ? 'btn-primary' : 'btn-outline'}" onclick="setFontScale(18)">크게</button>
            <button class="btn btn-sm ${fs === 20 ? 'btn-primary' : 'btn-outline'}" onclick="setFontScale(20)">더크게</button>
          </div>
        </div>
        ${pushOn ? `<button class="btn btn-outline btn-full" style="margin-top:6px" onclick="sendTestPush()">🧪 테스트 알림 보내기</button>` : ''}
      </div>

      <div class="section-title">추가 정보</div>
      <div class="card" style="padding:0 16px">
        ${profileRow('장애 여부', p?.has_disability ? '있음' : '없음')}
        ${profileRow('임신/출산', p?.has_pregnancy ? '해당' : '해당없음')}
        ${profileRow('영유아 자녀', p?.has_infant ? '있음' : '없음')}
        ${profileRow('기초/차상위', p?.is_low_income ? '해당' : '해당없음')}
      </div>

      <div style="height:100px"></div>
    </div>
  `;
}
function profileRow(label, value) {
  return `<div class="profile-item"><span class="profile-item-label">${label}</span><span class="profile-item-value">${value}</span></div>`;
}

// ── PWA 푸시 권한 요청 ────────────────────────────────────────────────
async function requestPushPermission() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    toast('이 브라우저는 푸시 알림을 지원하지 않아요', 'error'); return;
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast('알림 권한이 거부됐어요', 'error'); return; }
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    // 구독 정보 저장 — Supabase(로그인 시) + localStorage
    try { localStorage.setItem('push_subscription', JSON.stringify(sub)); } catch (_) {}
    if (ME) {
      await sb.from('push_subscriptions').upsert(
        { user_id: ME.id, subscription: sub },
        { onConflict: 'user_id' }
      );
    }
    localStorage.setItem('push_enabled', '1');
    toast('혜택 마감 알림이 설정됐어요 🔔', 'success');
  } catch (e) {
    console.error('push subscribe error', e);
    toast('알림 설정에 실패했어요', 'error');
  }
}

// 테스트 알림 보내기 (Vercel /api/push/send → PUSH_KEY 사용)
async function sendTestPush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) { toast('먼저 "알림 받기"를 설정해주세요', 'error'); return; }
    const r = await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub, title: '복지혜택 AI 🔔', body: '알림이 정상적으로 작동합니다!', url: '/' }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.sent) toast('테스트 알림을 보냈어요 🔔', 'success');
    else toast('전송 실패: ' + (d.error || '서버 확인 필요'), 'error', 3500);
  } catch (e) {
    toast('오류: ' + e.message, 'error');
  }
}
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

// ── 토스트 알림 ───────────────────────────────────────────────────────
function toast(msg, type = 'info', duration = 2500) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ── esc ───────────────────────────────────────────────────────────────
function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
