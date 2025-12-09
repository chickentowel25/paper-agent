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

## 7. PromptBuilder 사용법

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


