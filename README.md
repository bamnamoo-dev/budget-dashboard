# 📊 K-Edu 예산정산 대시보드 (Budget Dashboard)

> **K-에듀파인 엑셀 3종 원클릭 드래그 & 드롭으로 학교회계 목적사업비·수익자부담경비 세입-세출 1:1 연동 정산 및 실시간 불용 잔액 분석**

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live%20Demo-brightgreen?logo=github)](https://bamnamoo-dev.github.io/budget-dashboard/)
[![AI-SEN STORE Ecosystem](https://img.shields.io/badge/AI--SEN%20STORE-2%ED%96%89%20%ED%9A%8C%EA%B3%84%C2%B7%EC%A0%95%EC%82%B0%20%F0%9F%9F%A2-blue)](https://aisen.store)
[![Security: 100% Client Memory](https://img.shields.io/badge/Security-100%25%20In--Memory-emerald?logo=shield)](https://bamnamoo-dev.github.io/budget-dashboard/)

---

## 🌟 주요 기능 (Key Features)

1. **📥 정산 총괄표 및 월별 현황 고품격 엑셀(`.xlsx`) 다운로드 (ExcelJS)**
   - **천 단위 콤마 서식(`#,##0`) & 실제 숫자 타입**: 텍스트가 아닌 실제 숫자 데이터 및 합계 수식(`=SUM()`) 연동으로 엑셀 내 편집 및 추가 계산 완벽 지원
   - **보고서 수준 컬러 서식**: 세입(민트)·세출(로즈)·잔액(스카이블루) 2단 헤더, 회계 표준 이중 마감선, 넉넉한 열 너비 자동 최적화
   - **탭별 스마트 연동**: 정산 대시보드 및 산출내역별 월 지출 현황 엑셀 다운로드 지원
2. **📅 산출내역별 월 지출 현황 12개월(3월~익년 2월) 완벽 지원 & 전용 엑셀 다운로드**
   - 3월부터 12월, 익년 1월, 2월까지 12개월 연간 집행 흐름을 한눈에 파악
   - 각 월 클릭 시 하단 상세 지출 거래 내역 12개월 실시간 필터링
   - 카드 내 **[📊 월별 엑셀 다운로드]** 원클릭 내보내기 제공
3. **📁 다중 사업 프로필 & 전체 JSON 백업/복원**
   - 단일 프로그램 내에서 `학교급식운영`, `방과후학교`, `현장체험학습`, `목적사업비` 등 사업별 독립 장부 관리
   - 전체 프로필 데이터를 파일 하나로 안전하게 내보내기/불러오기 지원
4. **🔍 상세 지출실적 검색 및 '필터 합계 금액' 실시간 표기**
   - K-에듀파인 지출품의/결의 수준의 세부 원장 검색 시 건수와 함께 총 지출 합계 금액 실시간 계산
5. **📑 세출 산출내역별 지출 상세 드릴다운 (Drill-down)**
   - 산출내역명 클릭 시 해당 비목에 매칭된 지출 결의서 목록만 팝업 모달로 즉시 필터링 확인
6. **📖 5-탭 인터랙티브 사용자 매뉴얼 내장**
   - 상단 `[사용 설명서]` 버튼을 통해 3단계 빠른 시작, 에듀파인 다운로드 경로, 잔액 계산 공식 가이드 제공
7. **🔒 100% 브라우저 인메모리 보안**
   - 엑셀 파싱 및 정산 연산이 클라이언트(브라우저 메모리) 안에서만 수행되어 외부 유출 위험 0%
8. **🖨️ 결재용 A4 가로(Landscape) 2장 완벽 분할 인쇄 및 PDF 내보내기**
   - **제 1장 (결재용 정산 총괄표)**: 공문서 상단 헤더 + **화면 그대로 1행 3열 KPI 요약** + **예산세입세출 연동 정산표**가 1장에 꽉 차게 피팅
   - **제 2장 (시각화 분석 보고서)**: 세입 vs 세출 실적 막대 차트 + 주요 재원 집행 상태 요약이 2페이지에 2열 그리드로 큼직하게 배치
   - 다크 모드에서도 잉크 절약형 순백색 공문서 결재 서식으로 즉시 출력

---

## 🚀 빠른 시작 (3단계 사용법)

1. **사업 프로필 선택/추가**: 좌측 상단에서 분석할 사업(예: `학교급식운영`, `방과후학교`) 선택 또는 추가
2. **K-에듀파인 엑셀 3종 다운로드**:
   - **세입 산출내역**: `사업관리카드 ➡️ [해당사업] ➡️ [세입] 탭 ➡️ [엑셀]`
   - **세출 산출내역**: `사업관리카드 ➡️ [해당사업] ➡️ [세출] 탭 ➡️ [엑셀]`
   - **지출실적조회**: `지출관리 ➡️ 지출장부 ➡️ 지출현황 ➡️ 지출실적조회 ➡️ 기간(03.01~기준일) ➡️ [원인행위] 탭 ➡️ [엑셀]`
3. **엑셀 업로드**: 상단 **[엑셀 업로드]** 창에 3개 파일을 드래그 앤 드롭하고 **[데이터 적용하기]** 클릭

---

## 🛠️ 기술 스택

* **Frontend**: HTML5, Modern CSS3 (Glassmorphism, Dark/Light 테마, `@media print`), Vanilla Modern JS (ES6+)
* **Libraries**: ExcelJS (`exceljs.min.js`), SheetJS (`xlsx.full.min.js`), Chart.js 4.x, Font Awesome 6, Google Fonts (Outfit, Noto Sans KR)
* **Desktop Wrapper**: Python 3 (`run_app.py`), PyInstaller (`예산정산대시보드.exe`)
* **CI/CD & Hosting**: GitHub Actions & GitHub Pages (`main` 브랜치 자동 배포)

---

## 🔗 상위 생태계 연계

* **메인 포털 허브**: [AI-SEN STORE](https://aisen.store) (`\asisen-store\`)
* **핵심 AI 엔진**: [AI 행정 챗봇 v2 & 스마트 여비정산기](https://chatbot.aisen.store) (`\sen-chatbot-v2\`)
* **본 프로그램 라우트**: [K-Edu 예산정산 대시보드](https://bamnamoo-dev.github.io/budget-dashboard/) (`/tools/budget-settle`)
