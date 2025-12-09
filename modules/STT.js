const speech = require('@google-cloud/speech');
const path = require('path');

class STT {
    constructor() {
        // Google Cloud Speech 클라이언트 초기화
        this.client = new speech.SpeechClient({
            keyFilename: path.join(__dirname, 'google-cloud-key.json')
        });
    }

    /**
     * 오디오 데이터를 텍스트로 변환
     * @param {Buffer} audioBuffer - 오디오 데이터 버퍼
     * @param {Object} options - 인식 옵션
     * @param {string} options.encoding - 오디오 인코딩 (LINEAR16, WEBM_OPUS 등)
     * @param {number} options.sampleRateHertz - 샘플 레이트 (Hz)
     * @param {string} options.languageCode - 언어 코드 (기본값: 'ko-KR')
     * @returns {Promise<Object>} - 인식 결과 { transcript, confidence }
     */
    async recognize(audioBuffer, options = {}) {
        try {
            const {
                encoding = 'WEBM_OPUS',
                sampleRateHertz = 48000,
                languageCode = 'ko-KR'
            } = options;

            const request = {
                audio: {
                    content: audioBuffer.toString('base64')
                },
                config: {
                    encoding: encoding,
                    sampleRateHertz: sampleRateHertz,
                    languageCode: languageCode,
                    enableAutomaticPunctuation: true,
                    model: 'latest_long', // 긴 오디오에 최적화된 모델
                    useEnhanced: true // 향상된 모델 사용
                }
            };

            const [response] = await this.client.recognize(request);
            
            if (!response.results || response.results.length === 0) {
                return {
                    transcript: '',
                    confidence: 0,
                    isFinal: true
                };
            }

            // 가장 높은 신뢰도의 결과 사용
            const result = response.results[0];
            const alternative = result.alternatives[0];
            
            return {
                transcript: alternative.transcript || '',
                confidence: alternative.confidence || 0,
                isFinal: result.isFinalAlternative !== false
            };

        } catch (error) {
            console.error('Google Cloud Speech 인식 오류:', error);
            throw error;
        }
    }

    /**
     * 스트리밍 인식 시작 (실시간 인식용)
     * @param {Object} options - 인식 옵션
     * @returns {Object} - 스트리밍 인식 객체
     */
    createStreamingRecognize(options = {}) {
        const {
            sampleRateHertz = 48000,
            languageCode = 'ko-KR'
        } = options;

        const request = {
            config: {
                encoding: 'WEBM_OPUS',
                sampleRateHertz: sampleRateHertz,
                languageCode: languageCode,
                enableAutomaticPunctuation: true,
                model: 'latest_long',
                useEnhanced: true
            },
            interimResults: true, // 중간 결과도 받기
            singleUtterance: false // 연속 인식
        };

        return this.client.streamingRecognize(request);
    }
}

module.exports = STT;
