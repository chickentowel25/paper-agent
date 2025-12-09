// paperAgent.js
// Node.js CommonJS 형식으로 변환됨
// 필요한 패키지: npm i openai

const OpenAI = require("openai");
const fs = require("fs");

class PaperAgent {
  /**
   * @param {Object} options
   * @param {string} [options.apiKey=process.env.OPENAI_API_KEY]
   * @param {string} [options.model="o3"]
   * @param {"markdown"|"xml"|"plain"} [options.outputMode="markdown"]
   * @param {"none"|"minimal"|"low"|"medium"|"high"|"xhigh"} [options.reasoningEffort="low"]
   * @param {"low"|"medium"|"high"} [options.verbosity="medium"]
   * @param {boolean} [options.useWebSearch=true]
   */
  constructor({
    apiKey = process.env.OPENAI_API_KEY,
    model = "o3",
    outputMode = "markdown",
    reasoningEffort = "low",
    verbosity = "medium",
    useWebSearch = true,
  } = {}) {
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY 가 설정되어 있지 않습니다.");
    }

    this.client = new OpenAI({ apiKey });
    this.model = model;
    this.outputMode = outputMode;
    this.reasoningEffort = reasoningEffort;
    this.verbosity = verbosity;
    this.useWebSearch = useWebSearch;

    // 현재 선택된 논문 상태
    // { title: string, fileId?: string }
    this.paper = null;

    // Responses API 대화 메모리 (previous_response_id)
    this.lastResponseId = null;
  }

  /** Paper Agent의 기본 시스템 지침 (스크린샷 + 추가 포매팅 규칙 반영) */
  static get BASE_INSTRUCTIONS_KO() {
    return `
역할: "Paper Agent". 이 GPT는 사용자가 입력하거나 업로드한 논문, 기술 문서, 또는 보고서를 깊이 있게 이해하도록 돕는 역할을 한다.

[1] 논문 선택 및 범위
- 사용자가 논문 제목이나 파일을 처음으로 입력했다고 판단되면, 우선 해당 논문이 분석 대상으로 선택되었음을 한 단어로만 응답한다: "선택됨".
- 이후의 모든 질문에 대해서는 선택된 논문 하나에 한정해 분석하고 답변한다.
- 여러 논문을 동시에 섞어서 다루지 말고, 사용자가 명시적으로 요청하는 경우에만 새 논문으로 교체한다.

[2] 분석 방식
- 문서에 기반하여 핵심 내용을 구조적으로 분석하고, 연구 방법·결과·논의 등 주요 요소를 간결하면서도 정확하게 요약한다.
- 사용자는 충분한 배경 지식을 가진 사람으로 간주하므로, 설명을 지나치게 단순화하지 말고 논리적 깊이를 유지한다.
- 추측성 해석은 피하고, 통계적 근거와 데이터 중심의 분석을 우선한다.
- key takeaways, 결과, 방법론을 중심으로 핵심을 정리하되, 문서의 주요 논리 구조를 가능하면 유지한다.
- 필요할 경우 문서 외부의 정보(이론, 배경, 관련 연구 등)를 참고하여 문맥을 보충할 수 있으나, 문서와 직접 관련 없는 주제는 정중히 거절한다.
- 설명은 짧고 명확하게 유지하며, 논문 내용에 충실하게 답변한다.

[3] 포맷팅 및 출력 언어
- 기본 응답 언어는 한국어다.
- 답변은 사용자가 재사용하기 쉽게 구조화한다. 불필요한 수사나 장식은 피하고 정보 밀도를 높인다.
- 마크다운 또는 XML과 같이 구조화된 포맷을 사용할 수 있으며, 설정된 출력 모드에 맞춘다.

[4] 파일 활용
- 사용자가 첨부한 파일(input_file)은 항상 "현재 선택된 논문"으로 취급한다.
- 모델이 파일에 직접 접근할 수 있다는 점을 고려하여, 원문 인용이나 세부 수치 확인 시 파일 내용을 우선 참조한다.
    `.trim();
  }

  /** 출력 모드에 따른 포매팅 지침 생성 */
  buildFormattingInstruction() {
    if (this.outputMode === "xml") {
      return `
[5] XML 출력 규칙
- 모든 응답은 하나의 <response> 루트 태그 안에 포함한다.
- 가능한 한 다음과 같은 하위 태그를 활용한다:
  <meta>, <summary>, <key_takeaways>, <methods>, <results>, <discussion>, <limitations>, <future_work>, <notes>.
- 루트 태그 바깥에 아무 텍스트도 두지 않는다.
- 코드나 수식이 필요하면 적절한 태그(<code>, <equation> 등)를 추가해 구조적으로 표현한다.
      `.trim();
    }

    if (this.outputMode === "markdown") {
      return `
[5] Markdown 출력 규칙
- 큰 구조는 헤딩(##, ###)으로 나누고, 항목은 불릿/번호 목록으로 정리한다.
- 예: "## 핵심 요약", "## 연구 질문", "## 방법", "## 결과", "## 논의 및 한계" 등.
- 표가 유용한 경우 |열|헤더| 형태의 마크다운 표를 사용해 변수·지표·값을 정리한다.
- 코드 블록, 인용구, 수식 등을 적절히 사용해 읽기 쉽게 만든다.
      `.trim();
    }

    return `
[5] 일반 텍스트 출력 규칙
- 명확한 단락 구분과 간결한 문장 위주로 답변한다.
- 필요 이상으로 장황하게 설명하지 말고, 질문에 직접적으로 답한다.
    `.trim();
  }

  /** 현재 선택된 논문 정보를 지침에 추가 */
  buildPaperContextInstruction() {
    if (!this.paper) {
      return `
[6] 현재 논문 상태
- 아직 분석 대상으로 선택된 논문이 없다면, 사용자에게 먼저 논문 제목 또는 파일을 제공해 달라고 간단히 안내한다.
      `.trim();
    }

    const titlePart = this.paper.title
      ? `현재 선택된 논문 제목: "${this.paper.title}".`
      : "현재 선택된 논문은 파일로만 제공되었고, 제목 정보는 별도로 제공되지 않았다.";

    return `
[6] 현재 논문 상태
- ${titlePart}
- 이후의 모든 질문은 이 논문 하나만을 기준으로 해석하고 답변한다.
- 사용자가 '다른 논문으로 바꾸자'고 명시적으로 요청하지 않는 한, 논문 맥락을 유지한다.
    `.trim();
  }

  /** 최종 instructions 문자열 */
  buildInstructions() {
    return [
      PaperAgent.BASE_INSTRUCTIONS_KO,
      this.buildFormattingInstruction(),
      this.buildPaperContextInstruction(),
    ].join("\n\n");
  }

  /** 출력 모드 변경 (markdown / xml / plain) */
  setOutputMode(mode) {
    this.outputMode = mode;
  }

  /** 새로운 논문으로 교체 + 메모리 리셋 */
  setPaper({ title, fileId } = {}) {
    this.paper = { title: title || null, fileId: fileId || null };
    this.lastResponseId = null; // 논문이 바뀌면 대화도 리셋
  }

  /**
   * 로컬 파일 업로드 + 논문 설정
   * @param {string} filePath
   * @param {string} [title]
   * @returns {Promise<{title: string|null, fileId: string}>}
   */
  async uploadPaperFromPath(filePath, title = null) {
    const file = await this.client.files.create({
      file: fs.createReadStream(filePath),
      purpose: "user_data", // 모델 입력용 파일 :contentReference[oaicite:1]{index=1}
    });

    this.setPaper({
      title: title || filePath.split(/[\\/]/).pop(),
      fileId: file.id,
    });

    return { title: this.paper.title, fileId: this.paper.fileId };
  }

  /** 현재 선택된 논문을 "선택됨" 한 단어로만 알림 (커스텀 GPT 동작 재현) */
  async confirmPaperSelected() {
    if (!this.paper) {
      throw new Error("먼저 setPaper(...) 또는 uploadPaperFromPath(...)로 논문을 지정하세요.");
    }
    // 실제로는 모델을 호출하지 않고, 규칙대로 한 단어만 반환
    return "선택됨";
  }

  /**
   * 실제 질의 처리 (논문이 이미 선택되었다고 가정)
   * @param {string} question - 사용자의 질문 / 명령
   * @param {Object} [options]
   * @param {number} [options.maxOutputTokens=2048]
   * @param {boolean} [options.stream=false] - 스트리밍 모드 사용 여부
   * @returns {Promise<string>|AsyncIterable} - 모델의 텍스트 응답 또는 스트림
   */
  async ask(question, { maxOutputTokens = 2048, stream = false } = {}) {
    if (!this.paper) {
      throw new Error("논문이 아직 선택되지 않았습니다. 먼저 setPaper(...) 또는 uploadPaperFromPath(...)를 호출하세요.");
    }

    const content = [];

    if (this.paper.fileId) {
      content.push({
        type: "input_file",
        file_id: this.paper.fileId,
      });
    }

    content.push({
      type: "input_text",
      text: question,
    });

    const tools = [];
    if (this.useWebSearch) {
      tools.push({ type: "web_search" }); // 필요할 때 모델이 자체적으로 사용 :contentReference[oaicite:2]{index=2}
    }

    const requestParams = {
      model: this.model,
      instructions: this.buildInstructions(),
      input: [
        {
          role: "user",
          content,
        },
      ],
      tools: tools.length ? tools : undefined,
      previous_response_id: this.lastResponseId || undefined,
      max_output_tokens: maxOutputTokens,
      reasoning: {
        effort: this.reasoningEffort,
      },
      text: {
        format: { type: "text" },
        verbosity: this.verbosity,
      },
    };

    // o3 모델은 temperature를 지원하지 않으므로 조건부로 추가
    if (!this.model.startsWith('o3')) {
      requestParams.temperature = 0.3; // 요약/분석용이라 비교적 낮게
    }

    // 스트리밍 모드
    if (stream) {
      requestParams.stream = true;
      const streamResponse = await this.client.responses.create(requestParams);
      return streamResponse; // AsyncIterable 반환
    }

    // 일반 모드
    const response = await this.client.responses.create(requestParams);

    this.lastResponseId = response.id;
    return response.output_text; // Responses 객체의 편의 프로퍼티 :contentReference[oaicite:3]{index=3}
  }

  /**
   * ChatGPT UI와 최대한 비슷한 "한 턴 처리" 헬퍼.
   *
   * - 아직 논문이 선택되지 않은 상태에서 fileId 또는 title 이 들어오면:
   *     → 내부 상태에 논문을 설정하고 "선택됨"만 반환
   * - 이미 논문이 선택된 상태에서 새 fileId 가 들어오면:
   *     → 논문 교체 후 "선택됨" 반환
   * - 그 외에는 그냥 질문으로 보고 ask() 호출
   *
   * @param {Object} params
   * @param {string} params.message  - 사용자의 입력 텍스트
   * @param {string} [params.fileId] - 이미 업로드된 파일의 ID (선택)
   * @param {string} [params.title]  - 논문 제목(선택)
   */
  async handleUserTurn({ message, fileId, title } = {}) {
    const hasNewPaperInfo = !!fileId || (!!title && !this.paper);

    if (!this.paper && hasNewPaperInfo) {
      // 처음 논문 선택
      this.setPaper({ title: title || null, fileId: fileId || null });
      return "선택됨";
    }

    if (this.paper && fileId && fileId !== this.paper.fileId) {
      // 이미 논문이 있는데 새 파일이 들어오면 논문 교체
      this.setPaper({ title: title || this.paper.title, fileId });
      return "선택됨";
    }

    // 그 외에는 일반 질문으로 간주
    return this.ask(message);
  }

  /** 메모리/논문 상태 전체 리셋 */
  reset() {
    this.paper = null;
    this.lastResponseId = null;
  }
}

module.exports = PaperAgent;

/*
===========================
사용 예시 (Node.js)
===========================

import PaperAgent from "./paperAgent.js";

async function main() {
  const agent = new PaperAgent({
    // apiKey: "sk-...", // 또는 환경변수 OPENAI_API_KEY 사용
    model: "o3",
    outputMode: "markdown", // "xml" 로 바꾸면 XML 포맷으로 응답
    reasoningEffort: "low",
    verbosity: "medium",
    useWebSearch: true,
  });

  // 1. 로컬 PDF 업로드 + 논문 선택
  const paperInfo = await agent.uploadPaperFromPath(
    "./papers/sample-paper.pdf",
    "Sample Paper Title"
  );
  console.log("업로드된 논문:", paperInfo);

  // ChatGPT 커스텀 GPT처럼, 첫 턴에는 단순히 "선택됨"만 보여주고 싶다면:
  const ack = await agent.confirmPaperSelected();
  console.log("첫 응답:", ack); // → "선택됨"

  // 2. 논문에 대한 질문 (Markdown 출력)
  const answer1 = await agent.ask(
    "이 논문의 연구 질문과 사용된 방법(Method)을 표 형식으로 요약해줘."
  );
  console.log("\n[질문1 답변]\n", answer1);

  // 3. 같은 논문에 대한 후속 질문 (메모리 유지: previous_response_id 사용)
  const answer2 = await agent.ask(
    "위 논문의 주요 결과와 key takeaway를 3~5개의 불릿으로 정리해줘."
  );
  console.log("\n[질문2 답변]\n", answer2);

  // 4. XML 모드로 전환해서 요약 받기
  agent.setOutputMode("xml");
  const xmlSummary = await agent.ask(
    "이 논문의 전체 구조(서론-방법-결과-논의)를 중심으로 짧게 정리해줘."
  );
  console.log("\n[XML 요약]\n", xmlSummary);

  // 5. 다른 논문으로 교체하고 싶을 때 (이미 업로드된 fileId를 알고 있다고 가정)
  /*
  const newFileId = "file_abc123...";
  const res = await agent.handleUserTurn({
    message: "새 논문으로 바꾸자.",
    fileId: newFileId,
    title: "New Paper Title",
  });
  console.log(res); // → "선택됨"
  */

// (실제로 실행할 때는 주석 해제)
// main().catch(console.error);

