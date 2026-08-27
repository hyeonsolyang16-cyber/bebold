# 비볼드 (BeBold) — 주식 모의투자

Node.js/Express + React(Vite) 기반의 한국형 주식 모의투자(페이퍼 트레이딩) 웹앱입니다.

## 구조

```
/server   Express + better-sqlite3 백엔드 (포트 4000)
/client   React + Vite 프론트엔드 (포트 5173)
```

## 실행 방법

### 1. 백엔드

```bash
cd server
npm install
npm run dev
```

서버는 기본적으로 `http://localhost:4000` 에서 실행됩니다.

환경 변수:
- `JWT_SECRET` (선택) — 미설정 시 개발용 기본값(`vestin-dev-secret-change-me`) 사용 (내부 기본 시크릿 값, 변경하지 않음)
- `PORT` (선택) — 기본값 4000

### 2. 프론트엔드

```bash
cd client
npm install
npm run dev
```

Vite 개발 서버는 `http://localhost:5173` 에서 실행되며 `/api` 요청은 자동으로 `http://localhost:4000` 으로 프록시됩니다.

## 주요 기능

- 이메일/비밀번호 회원가입·로그인 (JWT 인증, bcrypt 해시), 가입 시 가상 자산 1,000만원 지급
- 종목 검색, 실시간(야후 파이낸스 비공식 API) 시세 조회 — 실패 시 모의 시세로 자동 대체
- 시장가 매수/매도, 평단가(가중평균) 계산, 보유 종목/평가손익/수익률 표시
- 종목 상세 페이지: 현재가, 등락률, 일별 캔들 차트, 매수/매도 폼
- 수익률 기준 전체 유저 랭킹
- 홈 대시보드: 총자산/수익률/당일 손익, 관심 종목, 최근 거래 내역

## 기술 스택

- Backend: Express, better-sqlite3, jsonwebtoken, bcryptjs
- Frontend: React 18, Vite, React Router, 순수 CSS (모바일 우선)
- 시세: Yahoo Finance 비공식 API (키 불필요), 실패 시 결정론적 랜덤워크 모의 데이터로 폴백

## 참고

- 한국 시장 관례에 따라 상승은 빨간색(RED), 하락은 파란색(BLUE)으로 표시됩니다.
- DB는 파일 기반 SQLite(`server/vestin.db`)로 별도 DB 서버가 필요 없습니다. (내부 DB 파일명, 변경하지 않음)
- PWA(설치형 웹앱)를 지원합니다. PC 브라우저 주소창의 설치 아이콘 또는 모바일 브라우저의 "홈 화면에 추가" 메뉴로 설치할 수 있습니다.
