// PromptBuilder 사용 예시
// 실행: node examples/prompt-builder-usage.js

require('dotenv').config();
const { PromptBuilder } = require('../modules/Responses');

async function example1_Markdown() {
  console.log('\n=== 예시 1: Markdown 포맷 ===\n');

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
}

async function example2_XML() {
  console.log('\n=== 예시 2: XML 포맷 ===\n');

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

  console.log(text);
}

async function example3_WithMemory() {
  console.log('\n=== 예시 3: 메모리 사용 ===\n');

  const { InMemoryMemoryStore } = require('../modules/Responses');
  const memoryStore = new InMemoryMemoryStore();
  const memoryKey = 'user-session-123';

  // 첫 번째 대화
  const pb1 = new PromptBuilder({
    apiKey: process.env.OPENAI_API_KEY,
    memoryStore,
    memoryKey,
  })
    .useModel("gpt-4o-mini")
    .setInstructions("당신은 친절한 AI 어시스턴트입니다. 한국어로 답변하세요.")
    .user("내 이름은 김철수야.");

  const { text: text1 } = await pb1.send();
  console.log('첫 번째 응답:', text1);

  // 두 번째 대화 (메모리 유지)
  const pb2 = new PromptBuilder({
    apiKey: process.env.OPENAI_API_KEY,
    memoryStore,
    memoryKey,
  })
    .useModel("gpt-4o-mini")
    .setInstructions("당신은 친절한 AI 어시스턴트입니다. 한국어로 답변하세요.")
    .user("내 이름이 뭐였지?");

  const { text: text2 } = await pb2.send();
  console.log('두 번째 응답:', text2);
}

async function example4_FewShot() {
  console.log('\n=== 예시 4: Few-shot 예시 ===\n');

  const pb = new PromptBuilder({ apiKey: process.env.OPENAI_API_KEY })
    .useModel("gpt-4o-mini")
    .setInstructions("사용자의 질문에 대해 친절하게 답변하세요.")
    .addExample("안녕", "안녕하세요! 무엇을 도와드릴까요?")
    .addExample("날씨 어때?", "죄송하지만 실시간 날씨 정보는 제공할 수 없습니다.")
    .user("안녕하세요");

  const { text } = await pb.send();
  console.log(text);
}

async function example5_WithPaperContent() {
  console.log('\n=== 예시 5: 논문 내용과 함께 사용 ===\n');

  // 실제 논문 내용을 읽어오는 예시 (간단한 텍스트로 대체)
  const paperContent = `
    제목: HCI에서의 AI 활용
    요약: 이 논문은 HCI 분야에서 AI 기술을 활용한 새로운 인터랙션 방법을 제안합니다.
    주요 내용: 사용자 경험 개선, 접근성 향상, 개인화된 인터페이스 설계 등이 포함됩니다.
  `;

  const pb = new PromptBuilder({ apiKey: process.env.OPENAI_API_KEY })
    .useModel("gpt-4o-mini")
    .setInstructions(`당신은 HCI 논문 전문가입니다. 다음 논문 내용을 바탕으로 답변하세요.

논문 내용:
${paperContent.substring(0, 10000)}`)
    .formatAsMarkdown({
      sections: ["핵심 내용", "주요 발견", "실용적 적용"],
    })
    .user("이 논문의 핵심 아이디어를 설명해주세요.");

  const { text } = await pb.send();
  console.log(text);
}

async function example6_Streaming() {
  console.log('\n=== 예시 6: 스트리밍 응답 ===\n');

  const pb = new PromptBuilder({ apiKey: process.env.OPENAI_API_KEY })
    .useModel("gpt-4o-mini")
    .setInstructions("한국어로 답변하세요.")
    .user("1부터 10까지 숫자를 하나씩 나열해주세요.");

  const stream = await pb.send({ stream: true });

  console.log('스트리밍 응답:');
  for await (const chunk of stream) {
    // 스트리밍 응답 처리 (실제 구현은 API 응답 구조에 따라 다를 수 있음)
    if (chunk.output_text) {
      process.stdout.write(chunk.output_text);
    }
  }
  console.log('\n');
}

// 메인 실행 함수
async function main() {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.error('오류: OPENAI_API_KEY 환경 변수가 설정되지 않았습니다.');
      process.exit(1);
    }

    // 각 예시 실행 (원하는 것만 주석 해제)
    await example1_Markdown();
    // await example2_XML();
    // await example3_WithMemory();
    // await example4_FewShot();
    // await example5_WithPaperContent();
    // await example6_Streaming();

  } catch (error) {
    console.error('오류 발생:', error);
  }
}

// 직접 실행 시에만 실행
if (require.main === module) {
  main();
}

module.exports = {
  example1_Markdown,
  example2_XML,
  example3_WithMemory,
  example4_FewShot,
  example5_WithPaperContent,
  example6_Streaming,
};

