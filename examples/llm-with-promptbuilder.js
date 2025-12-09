// LLM.js를 PromptBuilder로 리팩토링한 예시
// 실제 LLM.js에 적용하려면 이 코드를 참고하세요

require('dotenv').config();
const { PromptBuilder } = require('../modules/Responses');

class OpenAIServiceWithPromptBuilder {
    constructor() {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY가 환경 변수에 설정되지 않았습니다.');
        }
        
        this.client = null; // PromptBuilder가 내부적으로 관리
    }

    /**
     * 논문 내용을 학습하고 초기 프롬프트 생성
     */
    async initializeConversation(paperContent, mode) {
        try {
            const isTalk = mode === 'talk';
            const initialMessage = isTalk
                ? "안녕하세요! 논문에 대해 궁금한 점이 있으시면 언제든지 물어보세요. 음성으로 질문해주시면 답변드리겠습니다."
                : "안녕하세요! 논문에 대해 궁금한 점이 있으시면 언제든지 물어보세요. 텍스트로 질문해주시면 상세히 답변드리겠습니다.";

            const pb = new PromptBuilder({ apiKey: process.env.OPENAI_API_KEY })
                .useModel('gpt-4o')
                .setInstructions(`당신은 HCI 논문 전문가입니다. 사용자가 ${isTalk ? '음성' : '텍스트'}으로 논문에 대해 질문할 것입니다.
다음 논문의 전체 내용을 학습하고, 사용자의 질문에 명확하고 ${isTalk ? '간결하게' : '상세하게'} 답변해주세요.
5분이라는 제한 시간 내에 논문의 핵심 내용을 효과적으로 전달하는 것이 목표입니다.
답변은 한국어로 하고, ${isTalk ? '간결하고 이해하기 쉽게' : '구조화되고 이해하기 쉽게'} 설명해주세요.

논문 내용:
${paperContent.substring(0, 100000)}`)
                .setSampling({
                    temperature: 0.7,
                    maxOutputTokens: 500
                })
                .user('논문에 대해 간단히 소개해주세요.');

            const { text } = await pb.send();
            return text || initialMessage;
        } catch (error) {
            console.error('대화 초기화 오류:', error);
            throw error;
        }
    }

    /**
     * 사용자 메시지에 대한 AI 응답 생성 (PromptBuilder 사용)
     * @param {string} paperContent - 논문 전체 내용
     * @param {Array} conversationHistory - 대화 히스토리 [{role: 'user'|'assistant', content: string}]
     * @param {string} mode - 'talk' 또는 'text'
     * @param {string} userMessage - 현재 사용자 메시지 (선택적, conversationHistory에 포함되어 있지 않은 경우)
     * @returns {Promise<string>} - AI 응답
     */
    async generateResponse(paperContent, conversationHistory, mode, userMessage = null) {
        try {
            const isTalk = mode === 'talk';

            // PromptBuilder로 프롬프트 구성
            const pb = new PromptBuilder({ apiKey: process.env.OPENAI_API_KEY })
                .useModel('gpt-4o')
                .setInstructions(`당신은 HCI 논문 전문가입니다. 사용자가 ${isTalk ? '음성' : '텍스트'}으로 논문에 대해 질문하고 있습니다.
다음 논문의 전체 내용을 바탕으로 사용자의 질문에 명확하고 ${isTalk ? '간결하게' : '상세하게'} 답변해주세요.
답변은 한국어로 하고, ${isTalk ? '간결하고 이해하기 쉽게 설명해주세요. 음성으로 전달되므로 짧고 명확한 답변이 좋습니다.' : '구조화되고 이해하기 쉽게 설명해주세요.'}

논문 내용:
${paperContent.substring(0, 100000)}`)
                .setSampling({
                    temperature: 0.7,
                    maxOutputTokens: isTalk ? 300 : 1000
                });

            // 대화 히스토리 추가
            for (const msg of conversationHistory) {
                if (msg.role === 'user') {
                    pb.user(msg.content);
                } else if (msg.role === 'assistant') {
                    pb.assistant(msg.content);
                }
            }

            // 현재 사용자 메시지 추가 (conversationHistory에 포함되어 있지 않은 경우)
            if (userMessage) {
                pb.user(userMessage);
            }

            const { text } = await pb.send();
            return text;
        } catch (error) {
            console.error('응답 생성 오류:', error);
            throw error;
        }
    }

    /**
     * Markdown 포맷으로 응답 생성 (예시)
     * @param {string} paperContent - 논문 전체 내용
     * @param {Array} conversationHistory - 대화 히스토리 [{role: 'user'|'assistant', content: string}]
     * @param {string} mode - 'talk' 또는 'text'
     * @param {string} userMessage - 현재 사용자 메시지 (선택적)
     * @returns {Promise<string>} - AI 응답 (Markdown 포맷)
     */
    async generateResponseWithMarkdown(paperContent, conversationHistory, mode, userMessage = null) {
        try {
            const isTalk = mode === 'talk';

            const pb = new PromptBuilder({ apiKey: process.env.OPENAI_API_KEY })
                .useModel('gpt-4o')
                .setInstructions(`당신은 HCI 논문 전문가입니다. 한국어로 답변하세요.

논문 내용:
${paperContent.substring(0, 100000)}`)
                .formatAsMarkdown({
                    sections: isTalk ? ["핵심 요약", "주요 발견"] : ["요약", "핵심 기여", "한계", "적용 아이디어"],
                    headingLevel: 2,
                })
                .setSampling({
                    temperature: 0.7,
                    maxOutputTokens: isTalk ? 300 : 1000
                });

            // 대화 히스토리 추가
            for (const msg of conversationHistory) {
                if (msg.role === 'user') {
                    pb.user(msg.content);
                } else if (msg.role === 'assistant') {
                    pb.assistant(msg.content);
                }
            }

            // 현재 사용자 메시지 추가
            if (userMessage) {
                pb.user(userMessage);
            }

            const { text } = await pb.send();
            return text;
        } catch (error) {
            console.error('응답 생성 오류:', error);
            throw error;
        }
    }
}

// 사용 예시
async function example() {
    const service = new OpenAIServiceWithPromptBuilder();
    
    const paperContent = "논문 내용...";
    const conversationHistory = [
        { role: 'user', content: '이 논문의 핵심은 뭐야?' }
    ];
    
    // 일반 응답
    const response1 = await service.generateResponse(paperContent, conversationHistory, 'text');
    console.log('일반 응답:', response1);
    
    // Markdown 포맷 응답
    const response2 = await service.generateResponseWithMarkdown(paperContent, conversationHistory, 'text');
    console.log('Markdown 응답:', response2);
}

module.exports = OpenAIServiceWithPromptBuilder;

