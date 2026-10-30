# 👑 AIAL_Winner (미식 배틀 & AI 맛 심사 플랫폼)

12인의 멤버가 아침 / 점심 / 저녁 타임대에 식사 사진을 등록하면, 식사 타임대가 끝날 무렵 LLM(`sr-combo`)이 가장 맛있는 사진을 분석하여 **WIN**을 선정하는 미식 배틀 웹 애플리케이션입니다.

---

## 👥 참가 멤버(AIAL)

<details>
<summary><strong>👉 참가 멤버 목록 펼치기 / 접기 (클릭)</strong></summary>

<br />

1. **계**
2. **썬빈**
3. **먀미장 킴**
4. **강맹**
5. **엄엉**
6. **자라관**
7. **발발**
8. **재쫄**
9. **주식회사이리**
10. **삼성킴**
11. **문탷**
12. **실버**

</details>

---

## 🍽️ 주요 기능
- **간편 식사 등록**:
  - 로그인 없이 본인 이름(12인 중 1인) 단일 선택 (타임대별 1인 1회 제한)
  - 식사 타임대(아침 05:00~10:00, 점심 11:00~13:30, 저녁 17:00~22:00) 자동 판별 및 수동 선택 가능
  - 드래그 & 드롭, 파일 첨부 및 **클립보드(Ctrl+V) 이미지 붙여넣기** 완벽 지원
  - 클라이언트 캔버스 고화질 최적화 압축(WebP) 내장
  - 메뉴 이름/코멘트는 선택 사항 (사진과 멤버만 필수)
- **AI 미식 심사 (WIN 선정)**:
  - 타임대 종료 시각에 `oci2` crontab에서 자동 심사 (아침 10:00, 점심 13:30, 저녁 22:00)
  - 관리자 로그인 시 UI의 `[AI 맛 심사 시작]` 버튼으로 즉시 수동 판정 가능
  - 우승 메뉴에는 황금빛 `👑 WINNER` 배지와 맛 점수, AI 심사평 카드 적용
- **명예의 전당 (Leaderboard)**:
  - 12인의 총 식사 등록 수, WIN 승리 횟수, 승률(%) 랭킹 실시간 집계
  - 5 WIN 달성 시 관리자가 실제 SOL(솔라나) 코인 지급
- **관리자 기능**:
  - 식사 메뉴명/코멘트 수정 및 삭제 시 관리자 인증 요구

---

## ⚙️ Vercel 배포 시 환경 변수 (Environment Variables)

Vercel 대시보드 (`Settings -> Environment Variables`)에 아래 값을 등록합니다:

| 변수명 | 설명 |
|---|---|
| `MONGODB_URI` | 몽고디비 연결 문자열 (`mongodb+srv://ghdelqtlr_db_user`) |
| `MONGODB_DB_NAME` | 데이터베이스 이름 (`aial_winner`) |
| `ADMIN_ID` | 관리자 아이디 |
| `ADMIN_PW` | 관리자 비밀번호 |
| `LLM_API_URL` | NIM Provider |
| `LLM_MODEL` | `mistralai/mistral-large-4-1t-a52b` |
| `LLM_API_KEY` | API 키 |

> [!IMPORTANT]
> **MongoDB Atlas Network Access 설정**:  
> Vercel 서버리스 환경에서 MongoDB Atlas에 접속하려면, Atlas 대시보드의 `Network Access` 메뉴에서 IP Whitelist에 `0.0.0.0/0` (Allow Access from Anywhere)이 등록되어 있어야 합니다.
