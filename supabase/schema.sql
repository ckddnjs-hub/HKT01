-- ══════════════════════════════════════════════════════════
--  복지혜택 PWA — Supabase Schema
-- ══════════════════════════════════════════════════════════

-- 사용자 프로필
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT,
  gender        TEXT CHECK (gender IN ('male', 'female')),
  birth_year    INT,
  region        TEXT,        -- 시도 (예: 대전광역시)
  district      TEXT,        -- 시군구 (예: 유성구)
  address       TEXT,        -- 도로명 주소
  lat           FLOAT,
  lng           FLOAT,
  household_type TEXT CHECK (household_type IN ('single','couple','family','single_parent','extended','other')),
  household_size INT DEFAULT 1,
  income_level  INT,         -- 중위소득 % (50/75/100/150/200)
  income_amount INT,         -- 월 소득 (만원)
  housing_type  TEXT CHECK (housing_type IN ('own','jeonse','monthly_rent','public','other')),
  employment_status TEXT CHECK (employment_status IN ('employed','unemployed','self_employed','student','retired')),
  has_disability BOOLEAN DEFAULT false,
  disability_grade TEXT,
  has_pregnancy  BOOLEAN DEFAULT false,
  has_infant     BOOLEAN DEFAULT false,   -- 영유아 (만 6세 이하)
  is_single_parent BOOLEAN DEFAULT false,
  is_low_income  BOOLEAN DEFAULT false,
  onboarding_done BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- AI 대화 이력
CREATE TABLE IF NOT EXISTS conversations (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT CHECK (role IN ('user', 'assistant')),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 혜택 분석 결과 캐시
CREATE TABLE IF NOT EXISTS benefit_results (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  query      TEXT,
  result     JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PWA 푸시 구독 정보
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- RLS 활성화
ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE benefit_results   ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 본인 데이터만 접근
CREATE POLICY "own profile"       ON profiles          FOR ALL USING (auth.uid() = id);
CREATE POLICY "own conversations" ON conversations      FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own benefits"      ON benefit_results    FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own push"          ON push_subscriptions FOR ALL USING (auth.uid() = user_id);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
