// Web Speech API를 사용하는 클라이언트 사이드 STT 모듈
// 이 모듈은 클라이언트에서 사용되며, 서버는 Web Speech API로 변환된 텍스트를 받습니다.

/**
 * Web Speech API를 초기화하고 음성 인식을 시작하는 함수
 * @param {Object} options - 설정 옵션
 * @param {Function} options.onResult - 음성 인식 결과 콜백 (transcript, isFinal)
 * @param {Function} options.onError - 에러 콜백
 * @param {Function} options.onStart - 시작 콜백
 * @param {Function} options.onEnd - 종료 콜백
 * @param {string} options.lang - 언어 코드 (기본값: 'ko-KR')
 * @returns {Object} - recognition 객체와 제어 함수들
 */
function initializeWebSpeechSTT(options = {}) {
    const {
        onResult = () => {},
        onError = () => {},
        onStart = () => {},
        onEnd = () => {},
        lang = 'ko-KR'
    } = options;

    // Web Speech API 지원 확인
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        const error = new Error('Web Speech API가 지원되지 않습니다. Chrome 또는 Edge 브라우저를 사용해주세요.');
        onError(error);
        return null;
    }

    const recognition = new SpeechRecognition();
    recognition.interimResults = true;
    recognition.lang = lang;
    recognition.continuous = true; // 버튼을 누르고 있는 동안 계속 인식
    recognition.maxAlternatives = 1;

    let finalTranscript = '';
    let interimTranscript = '';
    let isRecording = false; // 녹음 상태 추적

    recognition.onstart = () => {
        console.log('음성 인식 시작');
        finalTranscript = '';
        interimTranscript = '';
        isRecording = true;
        onStart();
    };

    recognition.onresult = (event) => {
        interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            const confidence = event.results[i][0].confidence;
            
            if (event.results[i].isFinal) {
                finalTranscript += transcript + ' ';
                onResult(finalTranscript.trim(), true, confidence);
            } else {
                interimTranscript += transcript;
                onResult(finalTranscript + interimTranscript, false, confidence);
            }
        }
    };

    recognition.onerror = (event) => {
        console.error('음성 인식 오류:', event.error);
        // 'no-speech' 오류는 무시 (버튼을 누르고 있을 때 소리가 없어도 계속 대기)
        if (event.error === 'no-speech') {
            return;
        }
        const error = new Error(`음성 인식 오류: ${event.error}`);
        onError(error, event);
    };

    recognition.onend = () => {
        console.log('음성 인식 종료');
        isRecording = false;
        
        // 버튼을 누르고 있는 동안만 자동 재시작 (continuous 모드 유지)
        // 버튼을 떼면 자동 재시작하지 않음
        onEnd(finalTranscript.trim());
    };

    return {
        recognition,
        start: () => {
            try {
                // 이미 실행 중이면 재시작하지 않음
                if (isRecording) {
                    console.log('이미 음성 인식이 실행 중입니다.');
                    return;
                }
                finalTranscript = '';
                interimTranscript = '';
                recognition.start();
            } catch (error) {
                // 이미 실행 중인 경우 무시
                if (error.message && error.message.includes('already started')) {
                    console.log('음성 인식이 이미 실행 중입니다.');
                    return;
                }
                console.error('음성 인식 시작 오류:', error);
                onError(error);
            }
        },
        stop: () => {
            try {
                if (isRecording) {
                    recognition.stop();
                    isRecording = false;
                }
            } catch (error) {
                console.error('음성 인식 중지 오류:', error);
            }
        },
        abort: () => {
            try {
                if (isRecording) {
                    recognition.abort();
                    isRecording = false;
                }
            } catch (error) {
                console.error('음성 인식 중단 오류:', error);
            }
        },
        isRecording: () => isRecording,
        getTranscript: () => finalTranscript.trim(),
        clearTranscript: () => {
            finalTranscript = '';
            interimTranscript = '';
        },
        isSupported: true
    };
}

// Node.js 환경에서는 사용할 수 없으므로 빈 객체 반환
if (typeof window === 'undefined') {
    module.exports = {
        initializeWebSpeechSTT: () => {
            throw new Error('Web Speech API는 브라우저 환경에서만 사용할 수 있습니다.');
        }
    };
} else {
    // 브라우저 환경에서는 전역으로 export
    window.WebSpeechSTT = {
        initialize: initializeWebSpeechSTT
    };
    
    // CommonJS 형식으로도 export (클라이언트 번들러 사용 시)
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            initializeWebSpeechSTT
        };
    }
}
