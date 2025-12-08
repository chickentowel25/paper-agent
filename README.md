# Paper Agent 웹앱 실행 가이드

## 1. Google Cloud 키 파일 추가

`modules` 폴더에 `google-cloud-key.json` 파일을 추가하세요.
- Google Cloud Console에서 서비스 계정 키를 다운로드
- 파일명을 `google-cloud-key.json`으로 변경
- `modules` 폴더에 저장

## 2. 환경 변수 설정

프로젝트 루트에 `.env` 파일을 생성하고 다음 내용을 추가하세요:

```
OPENAI_API_KEY=your_openai_api_key_here
```

## 3. IP 주소 설정

`server.js` 파일의 285번째 줄에서 IP 주소를 변경할 수 있습니다:

```javascript
const HOST = '0.0.0.0'; // 모든 네트워크 인터페이스에서 접속 가능
```

특정 IP 주소로 변경하려면:
```javascript
const HOST = '192.168.0.100'; // 원하는 IP 주소로 변경
```

## 4. 설치 및 실행

```bash
npm install
npm start
```

서버가 실행되면 콘솔에 로컬 및 네트워크 접속 주소가 표시됩니다.

## 5. 논문 파일 관리

### 논문 파일 추가/교체

1. 논문 HTML 파일을 `papers` 폴더에 저장하세요.
2. 파일명은 논문 제목으로 저장하면 됩니다 (예: `논문제목.html`).
3. 서버를 재시작하면 자동으로 논문 목록이 업데이트됩니다.

**참고**: 논문 목록은 서버 시작 시 `papers` 폴더의 모든 `.html` 파일을 자동으로 읽어옵니다.

## 6. 모바일 접속 시 데스크톱 사이트 설정

모바일 브라우저에서 접속할 때:

### 삼성 인터넷
메뉴(⋮) → "데스크톱 사이트" 체크


