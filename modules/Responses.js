// promptEngine.js
const OpenAI = require("openai");

/**
 * 기본 메모리 저장소 (프로세스 메모리 기반)
 * - key: string (예: userId, sessionId, "rof-study:p15")
 * - value: OpenAI Responses input 형식의 메시지 배열
 */
class InMemoryMemoryStore {
  constructor() {
    this.store = new Map();
  }

  async load(key) {
    return this.store.get(key) ?? [];
  }

  async save(key, messages) {
    this.store.set(key, messages);
  }

  async clear(key) {
    this.store.delete(key);
  }
}

/**
 * PromptBuilder
 *
 * 목표:
 * - 모델 선택
 * - 시스템/개발자/유저/어시스턴트 역할 메시지
 * - few-shot 예시
 * - 파일 레퍼런스 (file_search vector store)
 * - 메모리(대화 히스토리) 주입
 * - prompt cache (prompt_cache_key / retention)
 * - 기타 sampling 옵션
 *
 * 사용 예시는 아래쪽에 있음.
 */
class PromptBuilder {
  constructor({
    client,
    apiKey,
    defaultModel = "gpt-5.1-mini",
    memoryStore = new InMemoryMemoryStore(),
    memoryKey = null,
  } = {}) {
    this.client =
      client ??
      new OpenAI({
        apiKey: apiKey ?? process.env.OPENAI_API_KEY,
      });

    this.model = defaultModel;
    this.instructions = null;
    this.formatDirectives = []; // Markdown/XML 등 출력 포맷 지시문 누적

    // messages는 Responses API의 message-style input으로 구성
    // [{ role: "user" | "assistant" | "system" | "developer", content: string }]
    this.messages = [];

    // few-shot 예시: [{ user: string, assistant: string }]
    this.examples = [];

    // built-in tools
    this.tools = [];
    this.toolChoice = undefined;

    // file_search용 vector store ids
    this.fileVectorStoreIds = [];

    // web_search 도구 사용 여부
    this.webSearchEnabled = false;

    // 메타데이터, prompt cache 설정
    this.metadata = {};
    this.promptCacheKey = undefined;
    this.promptCacheRetention = undefined;

    // sampling / generation 옵션
    this.temperature = undefined;
    this.topP = undefined;
    this.maxOutputTokens = undefined;

    // memory 관련
    this.memoryStore = memoryStore;
    this.memoryKey = memoryKey; // null이면 메모리 안 씀
  }

  /** ========== 기본 설정 영역 ========== */

  useModel(modelId) {
    this.model = modelId;
    return this;
  }

  setInstructions(text) {
    // 시스템/개발자 레벨의 global instruction
    this.instructions = text;
    return this;
  }

  setMetadata(obj) {
    this.metadata = { ...this.metadata, ...obj };
    return this;
  }

  setPromptCache({ key, retention } = {}) {
    this.promptCacheKey = key;
    this.promptCacheRetention = retention; // 예: "24h"
    return this;
  }

  setSampling({ temperature, topP, maxOutputTokens } = {}) {
    if (temperature !== undefined) this.temperature = temperature;
    if (topP !== undefined) this.topP = topP;
    if (maxOutputTokens !== undefined) this.maxOutputTokens = maxOutputTokens;
    return this;
  }

  useMemoryKey(key) {
    this.memoryKey = key;
    return this;
  }

  /** 출력 포맷 지시 추가: Markdown */
  formatAsMarkdown({
    sections = [],
    codeBlockLang,
    headingLevel = 2,
    includeToc = false,
  } = {}) {
    const lines = ["출력은 Markdown으로 작성합니다."];
    if (includeToc) lines.push("- 간단한 목차(링크) 포함");
    if (sections.length > 0) {
      const h = "#".repeat(Math.max(1, headingLevel));
      lines.push(
        "- 아래 섹션 순서로 작성:",
        ...sections.map((s) => `  - ${h} ${s}`)
      );
    }
    if (codeBlockLang) {
      lines.push(`- 코드/예시는 \`\`\`${codeBlockLang}\`\`\` 코드블록 사용`);
    }
    this.formatDirectives.push(lines.join("\n"));
    return this;
  }

  /** 출력 포맷 지시 추가: XML */
  formatAsXml({
    rootTag = "response",
    fields = [],
    includeCdata = false,
  } = {}) {
    const lines = [
      "출력은 순수 XML로 반환합니다. 추가 텍스트/코멘트 금지.",
      `루트 태그: <${rootTag}>`,
    ];
    if (fields.length > 0) {
      lines.push(
        "자식 태그 스키마:",
        ...fields.map((f) => `- <${f.name}>: ${f.desc || ""}`)
      );
    }
    if (includeCdata) {
      lines.push("- 특수문자는 <![CDATA[ ... ]]> 로 감쌉니다.");
    }
    this.formatDirectives.push(lines.join("\n"));
    return this;
  }

  /** ========== 역할 기반 메시지 빌더 ========== */

  system(text) {
    this.messages.push({ role: "system", content: text });
    return this;
  }

  developer(text) {
    this.messages.push({ role: "developer", content: text });
    return this;
  }

  user(text) {
    this.messages.push({ role: "user", content: text });
    return this;
  }

  assistant(text) {
    this.messages.push({ role: "assistant", content: text });
    return this;
  }

  /**
   * Few-shot 예시 추가
   * 예) addExample("사용자 질문 예시", "어시스턴트의 좋은 답변 예시");
   */
  addExample(userText, assistantText) {
    this.examples.push({ user: userText, assistant: assistantText });
    return this;
  }

  /** ========== 파일 / 툴 관련 ========== */

  /**
   * file_search 내에서 사용될 vector_store_ids 설정
   * - vector store는 별도로 미리 생성되어 있어야 함.
   */
  useFileSearch(vectorStoreIds = []) {
    this.fileVectorStoreIds = vectorStoreIds;

    // tools 배열에 file_search 도구 추가
    this.tools = this.tools.filter((t) => t.type !== "file_search");

    if (vectorStoreIds.length > 0) {
      this.tools.push({
        type: "file_search",
        vector_store_ids: vectorStoreIds,
      });
    }

    return this;
  }

  /**
   * web_search 활성화
   * - 단순히 도구 리스트에 web_search 추가
   */
  useWebSearch(options = {}) {
    this.webSearchEnabled = true;

    // 중복 추가 방지
    this.tools = this.tools.filter((t) => t.type !== "web_search");
    this.tools.push({
      type: "web_search",
      // options에 필드가 생기면 여기로 전달
      ...options,
    });

    return this;
  }

  /**
   * 특정 툴 강제 선택 등
   * 예: setToolChoice("required") 또는 { type: "tool", name: "my_function" }
   */
  setToolChoice(choice) {
    this.toolChoice = choice;
    return this;
  }

  /** ========== 내부 헬퍼 ========== */

  /**
   * 메시지를 Responses API 형식으로 변환
   * - content가 문자열이면 [{ type: 'input_text'|'output_text', text: ... }] 형식으로 변환
   * - 이미 배열 형식이면 그대로 사용
   */
  _convertToResponsesFormat(messages) {
    return messages.map((msg) => {
      // 이미 Responses API 형식인 경우 (content가 배열)
      if (Array.isArray(msg.content)) {
        return msg;
      }

      // 문자열 content를 Responses API 형식으로 변환
      const isAssistant = msg.role === "assistant";
      const contentType = isAssistant ? "output_text" : "input_text";

      return {
        role: msg.role,
        content: [{ type: contentType, text: msg.content }],
      };
    });
  }

  /**
   * few-shot 예시를 실제 input message 배열로 펼치는 함수
   */
  _expandExamples() {
    const arr = [];
    for (const ex of this.examples) {
      arr.push({ role: "user", content: ex.user });
      arr.push({ role: "assistant", content: ex.assistant });
    }
    return arr;
  }

  /**
   * Responses API input 메시지 배열 생성
   * 메모리 + 예시 + 현재 메시지 순서로 합치고 Responses API 형식으로 변환
   */
  async _buildInputMessages() {
    const history =
      this.memoryKey && this.memoryStore
        ? await this.memoryStore.load(this.memoryKey)
        : [];

    const expandedExamples = this._expandExamples();
    const allMessages = [...history, ...expandedExamples, ...this.messages];

    // Responses API 형식으로 변환
    return this._convertToResponsesFormat(allMessages);
  }

  /**
   * Responses 객체에서 output 텍스트만 추출
   * - openai-node SDK는 response.output_text 헬퍼를 제공함 (최신 버전 기준)
   */
  _extractOutputText(response) {
    // 공식 SDK에 response.output_text가 있는 경우
    if (response.output_text !== undefined) {
      return response.output_text;
    }

    // fallback: output 배열에서 message 찾아 text 합치기
    if (Array.isArray(response.output)) {
      const texts = [];
      for (const item of response.output) {
        if (item.type === "message" && Array.isArray(item.content)) {
          for (const c of item.content) {
            if (c.type === "output_text" && c.text) {
              texts.push(c.text);
            }
          }
        }
      }
      return texts.join("\n");
    }

    return "";
  }

  /**
   * 메모리 저장용으로 이번 turn 메시지 + 모델 응답을 history로 저장
   */
  async _updateMemory(historyBefore, assistantText) {
    if (!this.memoryKey || !this.memoryStore) return;

    const newHistory = [
      ...historyBefore,
      ...this._expandExamples(), // 예시는 보통 static이지만, 필요하다면 포함
      ...this.messages,
      { role: "assistant", content: assistantText },
    ];

    await this.memoryStore.save(this.memoryKey, newHistory);
  }

  /** ========== 실행 ========== */

  /**
   * 실제로 Responses API 호출
   */
  async send({ stream = false, storeMemory = true } = {}) {
    const history =
      this.memoryKey && this.memoryStore
        ? await this.memoryStore.load(this.memoryKey)
        : [];

    const inputMessages = await this._buildInputMessages();

    const payload = {
      model: this.model,
      input: inputMessages,
    };

    const combinedInstructions = [
      this.instructions,
      ...this.formatDirectives,
    ]
      .filter(Boolean)
      .join("\n\n");

    if (combinedInstructions) payload.instructions = combinedInstructions;
    if (this.metadata && Object.keys(this.metadata).length > 0) {
      payload.metadata = this.metadata;
    }
    if (this.promptCacheKey) {
      payload.prompt_cache_key = this.promptCacheKey;
    }
    if (this.promptCacheRetention) {
      payload.prompt_cache_retention = this.promptCacheRetention;
    }
    if (this.temperature !== undefined) payload.temperature = this.temperature;
    if (this.topP !== undefined) payload.top_p = this.topP;
    if (this.maxOutputTokens !== undefined) {
      payload.max_output_tokens = this.maxOutputTokens;
    }
    if (this.tools.length > 0) payload.tools = this.tools;
    if (this.toolChoice !== undefined) payload.tool_choice = this.toolChoice;

    // streaming/non-streaming 분기
    if (stream) {
      // streaming 모드: for-await-of으로 이벤트를 넘겨줌
      const streamResp = await this.client.responses.create({
        ...payload,
        stream: true,
      });

      return streamResp; // 사용자가 직접 for await...으로 읽도록
    } else {
      const response = await this.client.responses.create(payload);

      const text = this._extractOutputText(response);

      if (storeMemory) {
        await this._updateMemory(history, text);
      }

      return {
        raw: response,
        text,
      };
    }
  }

  /** 기존 설정을 유지한 채, 새 메시지로 세션을 이어가고 싶을 때 */
  fork() {
    const clone = new PromptBuilder({
      client: this.client,
      defaultModel: this.model,
      memoryStore: this.memoryStore,
      memoryKey: this.memoryKey,
    });

    clone.instructions = this.instructions;
    clone.formatDirectives = [...this.formatDirectives];
    clone.examples = [...this.examples];
    clone.tools = [...this.tools];
    clone.toolChoice = this.toolChoice;
    clone.fileVectorStoreIds = [...this.fileVectorStoreIds];
    clone.webSearchEnabled = this.webSearchEnabled;
    clone.metadata = { ...this.metadata };
    clone.promptCacheKey = this.promptCacheKey;
    clone.promptCacheRetention = this.promptCacheRetention;
    clone.temperature = this.temperature;
    clone.topP = this.topP;
    clone.maxOutputTokens = this.maxOutputTokens;

    return clone;
  }
}

module.exports = {
  PromptBuilder,
  InMemoryMemoryStore,
};
