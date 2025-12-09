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

## 7. Android 기기에서 localhost로 접속하기

Android 기기에서 마이크 권한 문제를 해결하기 위해 localhost로 접속하는 방법입니다.

이 방법을 사용하면 Android 기기에서 `http://localhost:3000`으로 직접 접속할 수 있습니다.

### 1단계: Android 개발자 옵션 활성화

1. Android 기기에서 **설정** → **휴대전화 정보** (또는 **디바이스 정보**)
2. **빌드 번호**를 7번 연속으로 탭
3. "개발자가 되었습니다!" 메시지 확인

### 2단계: USB 디버깅 활성화

1. **설정** → **개발자 옵션**
2. **USB 디버깅** 활성화
3. (선택) **USB 디버깅(보안 설정)** 활성화 (있는 경우)

### 3단계: Android SDK Platform Tools 다운로드

1. [Android SDK Platform Tools](https://developer.android.com/tools/releases/platform-tools) 다운로드
2. 압축 해제 (예: `C:\Users\USER\Downloads\platform-tools-latest-windows\platform-tools`)

### 4단계: USB로 기기 연결 및 권한 허용

1. USB 케이블로 Android 기기를 컴퓨터에 연결
2. 기기에서 "USB 디버깅을 허용하시겠습니까?" 팝업이 나타나면:
   - **허용** 또는 **확인** 선택
   - **이 컴퓨터에서 항상 허용** 체크 (선택)
3. USB 연결 모드를 **파일 전송** 또는 **MTP**로 설정

### 5단계: adb reverse 설정

PowerShell 또는 명령 프롬프트에서:

```bash
# adb.exe가 있는 폴더로 이동
cd C:\Users\USER\Downloads\platform-tools-latest-windows\platform-tools

# 기기 연결 확인
.\adb.exe devices
```

`adb devices` 실행 시:
- `unauthorized`가 표시되면 → 기기에서 USB 디버깅 권한 팝업 확인
- `device`가 표시되면 → 정상 연결됨

연결이 확인되면 포트 포워딩 설정:

```bash
.\adb.exe reverse tcp:3000 tcp:3000
```

성공 메시지가 없으면 정상입니다.

### 6단계: 서버 실행 및 접속

1. 서버 실행:
   ```bash
   npm start
   ```

2. Android 기기 브라우저에서 접속:
   - 주소창에 `http://localhost:3000` 입력
   - 또는 `http://127.0.0.1:3000` 입력

### 문제 해결

**"device unauthorized" 오류:**
- 기기에서 USB 디버깅 권한 팝업 확인
- USB 케이블을 뽑았다가 다시 연결
- `adb kill-server` 실행 후 `adb devices` 재실행

**기기가 인식되지 않음:**
- USB 드라이버 설치 확인 (Samsung 기기는 Samsung USB Driver 필요)
- 다른 USB 케이블/포트 시도
- USB 연결 모드 확인 (파일 전송 모드)

**포트 포워딩이 작동하지 않음:**
- USB 연결이 유지되어 있는지 확인
- `adb reverse --list`로 포워딩 상태 확인
- `adb reverse --remove-all` 후 다시 설정

## 8. PromptBuilder 사용법

`modules/Responses.js`의 `PromptBuilder`를 사용하여 프롬프트를 체계적으로 구성할 수 있습니다.

### 기본 사용법

```javascript
const { PromptBuilder } = require('./modules/Responses');

// Markdown 포맷으로 응답 받기
const pb = new PromptBuilder({ apiKey: process.env.OPENAI_API_KEY })
  .useModel("gpt-4o-mini")
  .setInstructions("역할: 학술 논문 요약 비서. 한국어로 답변.")
  .formatAsMarkdown({
    sections: ["요약", "핵심 기여", "한계", "적용 아이디어"],
    codeBlockLang: "json",
  })
  .user("이 논문의 핵심을 알려줘.");

const { text } = await pb.send();
console.log(text);
```

### XML 포맷 사용

```javascript
const { text } = await new PromptBuilder({ apiKey: process.env.OPENAI_API_KEY })
  .setInstructions("한국어로만 답변.")
  .formatAsXml({
    rootTag: "answer",
    fields: [
      { name: "summary", desc: "핵심 요약" },
      { name: "risk", desc: "위험 또는 한계" },
      { name: "next_step", desc: "다음 액션" },
    ],
    includeCdata: true,
  })
  .user("모델 전환 가이드 요약해줘.")
  .send();
```

### 메모리 사용 (대화 히스토리 유지)

```javascript
const { PromptBuilder, InMemoryMemoryStore } = require('./modules/Responses');

const memoryStore = new InMemoryMemoryStore();
const memoryKey = 'user-session-123';

// 첫 번째 대화
const pb1 = new PromptBuilder({
  apiKey: process.env.OPENAI_API_KEY,
  memoryStore,
  memoryKey,
})
  .setInstructions("당신은 친절한 AI 어시스턴트입니다.")
  .user("내 이름은 김철수야.");

const { text: text1 } = await pb1.send();

// 두 번째 대화 (메모리 유지)
const pb2 = new PromptBuilder({
  apiKey: process.env.OPENAI_API_KEY,
  memoryStore,
  memoryKey,
})
  .setInstructions("당신은 친절한 AI 어시스턴트입니다.")
  .user("내 이름이 뭐였지?");

const { text: text2 } = await pb2.send(); // "김철수"라고 답변
```

### Few-shot 예시 추가

```javascript
const pb = new PromptBuilder({ apiKey: process.env.OPENAI_API_KEY })
  .setInstructions("사용자의 질문에 대해 친절하게 답변하세요.")
  .addExample("안녕", "안녕하세요! 무엇을 도와드릴까요?")
  .addExample("날씨 어때?", "죄송하지만 실시간 날씨 정보는 제공할 수 없습니다.")
  .user("안녕하세요");
```

### 더 많은 예시

`examples/prompt-builder-usage.js` 파일에 다양한 사용 예시가 포함되어 있습니다:

```bash
node examples/prompt-builder-usage.js
```

### 주요 기능

- **모델 선택**: `.useModel("gpt-4o-mini")`
- **지시문 설정**: `.setInstructions("...")`
- **Markdown 포맷**: `.formatAsMarkdown({ sections: [...], codeBlockLang: "json" })`
- **XML 포맷**: `.formatAsXml({ rootTag: "response", fields: [...] })`
- **메모리 관리**: `InMemoryMemoryStore`와 `memoryKey` 사용
- **Few-shot 예시**: `.addExample(userText, assistantText)`
- **샘플링 옵션**: `.setSampling({ temperature: 0.7, maxOutputTokens: 1000 })`
- **역할 메시지**: `.system()`, `.developer()`, `.user()`, `.assistant()`


