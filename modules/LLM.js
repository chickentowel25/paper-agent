const OpenAI = require('openai');

class OpenAIService {
    constructor() {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY가 환경 변수에 설정되지 않았습니다.');
        }
        
        this.client = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
    }

    /**
     * 논문 내용을 학습하고 초기 프롬프트 생성
     * (사용자가 먼저 질문하므로 현재는 사용하지 않지만, Responses API 예시로 남겨둠)
     * @param {string} paperContent - 논문 전체 내용
     * @param {string} mode - 'talk' 또는 'text'
     * @returns {Promise<string>} - AI의 초기 인사말
     */
    async initializeConversation(paperContent, mode) {
        try {
            const systemPrompt = mode === 'talk' 
                ? `당신은 HCI 논문 전문가입니다. 사용자가 음성으로 논문에 대해 질문할 것입니다. 
다음 논문의 전체 내용을 학습하고, 사용자의 질문에 명확하고 간결하게 답변해주세요.
5분이라는 제한 시간 내에 논문의 핵심 내용을 효과적으로 전달하는 것이 목표입니다.
답변은 한국어로 하고, 간결하고 이해하기 쉽게 설명해주세요.

논문 내용:
${paperContent.substring(0, 100000)}` // 토큰 제한을 위해 처음 100000자만 사용
                : `당신은 HCI 논문 전문가입니다. 사용자가 텍스트로 논문에 대해 질문할 것입니다.
다음 논문의 전체 내용을 학습하고, 사용자의 질문에 명확하고 상세하게 답변해주세요.
5분이라는 제한 시간 내에 논문의 핵심 내용을 효과적으로 전달하는 것이 목표입니다.
답변은 한국어로 하고, 구조화되고 이해하기 쉽게 설명해주세요.

논문 내용:
${paperContent.substring(0, 100000)}`; // 토큰 제한을 위해 처음 100000자만 사용

            const initialMessage = mode === 'talk'
                ? "안녕하세요! 논문에 대해 궁금한 점이 있으시면 언제든지 물어보세요. 음성으로 질문해주시면 답변드리겠습니다."
                : "안녕하세요! 논문에 대해 궁금한 점이 있으시면 언제든지 물어보세요. 텍스트로 질문해주시면 상세히 답변드리겠습니다.";

            const response = await this.client.responses.create({
                model: 'gpt-4o',
                input: [
                    {
                        role: 'system',
                        content: [{ type: 'input_text', text: systemPrompt }]
                    },
                    {
                        role: 'user',
                        content: [{ type: 'input_text', text: '논문에 대해 간단히 소개해주세요.' }]
                    }
                ],
                temperature: 0.7,
                max_output_tokens: 500
            });

            const text = response.output_text 
                || (response.output?.[0]?.content?.find(c => c.type === 'output_text')?.text ?? '').trim();

            return text || initialMessage;
        } catch (error) {
            console.error('대화 초기화 오류:', error);
            throw error;
        }
    }

    /**
     * 사용자 메시지에 대한 AI 응답 생성 (Responses API 사용)
     * @param {string} paperContent - 논문 전체 내용
     * @param {Array} conversationHistory - 대화 히스토리 [{role: 'user'|'assistant', content: string}]
     * @param {string} mode - 'talk' 또는 'text'
     * @returns {Promise<string>} - AI 응답
     */
    async generateResponse(paperContent, conversationHistory, mode) {
        try {
            const systemPrompt = mode === 'talk'
                ? `당신은 HCI 논문 전문가입니다. 사용자가 음성으로 논문에 대해 질문하고 있습니다.
다음 논문의 전체 내용을 바탕으로 사용자의 질문에 명확하고 간결하게 답변해주세요.
답변은 한국어로 하고, 간결하고 이해하기 쉽게 설명해주세요. 음성으로 전달되므로 짧고 명확한 답변이 좋습니다.

논문 내용:
${paperContent.substring(0, 100000)}`
                : `당신은 HCI 논문 전문가입니다. 사용자가 텍스트로 논문에 대해 질문하고 있습니다.
다음 논문의 전체 내용을 바탕으로 사용자의 질문에 명확하고 상세하게 답변해주세요.
답변은 한국어로 하고, 구조화되고 이해하기 쉽게 설명해주세요.

논문 내용:
${paperContent.substring(0, 100000)}`;

            // Responses API 입력 형식으로 변환
            const inputMessages = [
                {
                    role: 'system',
                    content: [{ type: 'input_text', text: systemPrompt }]
                },
                ...conversationHistory.map(msg => {
                    const isAssistant = msg.role === 'assistant';
                    return {
                        role: msg.role,
                        content: [{
                            type: isAssistant ? 'output_text' : 'input_text',
                            text: msg.content
                        }]
                    };
                })
            ];

            const response = await this.client.responses.create({
                model: 'gpt-4o',
                input: inputMessages,
                temperature: 0.7,
                max_output_tokens: mode === 'talk' ? 300 : 1000
            });

            const text = response.output_text 
                || (response.output?.[0]?.content?.find(c => c.type === 'output_text')?.text ?? '').trim();

            return text;
        } catch (error) {
            console.error('응답 생성 오류:', error);
            throw error;
        }
    }
}

module.exports = OpenAIService;

