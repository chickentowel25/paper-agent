// Google Cloud Speech-to-Text를 사용하는 클라이언트 사이드 STT 모듈
// MediaRecorder API로 오디오를 녹음하고 서버로 전송하여 STT 처리

/**
 * Google Cloud Speech STT를 초기화하고 음성 인식을 시작하는 함수
 * @param {Object} options - 설정 옵션
 * @param {Function} options.onResult - 음성 인식 결과 콜백 (transcript, isFinal, confidence)
 * @param {Function} options.onError - 에러 콜백
 * @param {Function} options.onStart - 시작 콜백
 * @param {Function} options.onEnd - 종료 콜백
 * @param {string} options.lang - 언어 코드 (기본값: 'ko-KR')
 * @returns {Object} - 제어 함수들
 */
function initializeGoogleCloudSTT(options = {}) {
    const {
        onResult = () => {},
        onError = () => {},
        onStart = () => {},
        onEnd = () => {},
        lang = 'ko-KR'
    } = options;

    // MediaRecorder API 지원 확인
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const error = new Error('미디어 장치 접근이 지원되지 않습니다. HTTPS 또는 localhost에서 실행해주세요.');
        onError(error);
        return null;
    }

    let mediaRecorder = null;
    let audioChunks = [];
    let audioStream = null;
    let isRecording = false;
    let recognitionInterval = null;

    // 오디오 스트림 가져오기
    async function getAudioStream() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 48000,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            return stream;
        } catch (error) {
            console.error('마이크 접근 오류:', error);
            throw new Error('마이크 접근 권한이 필요합니다.');
        }
    }

    // 오디오를 Base64로 변환
    function audioBlobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = reader.result.split(',')[1]; // data:audio/webm;base64, 부분 제거
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    // 서버로 오디오 전송 및 STT 인식
    async function recognizeAudio(audioBlob) {
        try {
            const audioBase64 = await audioBlobToBase64(audioBlob);
            
            const response = await fetch('/api/stt/recognize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    audioBase64: audioBase64,
                    encoding: 'WEBM_OPUS',
                    sampleRateHertz: 48000
                })
            });

            const data = await response.json();
            
            if (data.success && data.transcript) {
                onResult(data.transcript, data.isFinal, data.confidence);
            } else if (data.error) {
                onError(new Error(data.error));
            }
        } catch (error) {
            console.error('STT 인식 오류:', error);
            onError(error);
        }
    }

    // 주기적으로 오디오 청크를 서버로 전송 (실시간 인식)
    function startPeriodicRecognition() {
        // 2초마다 오디오 청크를 전송하여 인식
        recognitionInterval = setInterval(async () => {
            if (audioChunks.length > 0 && isRecording) {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' });
                // 마지막 2초간의 오디오만 사용 (최근 음성 인식)
                await recognizeAudio(audioBlob);
                // 처리한 청크는 유지하지 않음 (메모리 절약)
            }
        }, 2000);
    }

    return {
        start: async () => {
            try {
                if (isRecording) {
                    console.log('이미 녹음이 실행 중입니다.');
                    return;
                }

                // 오디오 스트림 가져오기
                audioStream = await getAudioStream();

                // MediaRecorder 초기화
                const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
                    ? 'audio/webm;codecs=opus' 
                    : 'audio/webm';
                
                mediaRecorder = new MediaRecorder(audioStream, {
                    mimeType: mimeType,
                    audioBitsPerSecond: 128000
                });

                audioChunks = [];
                isRecording = true;

                // 오디오 데이터 수집
                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        audioChunks.push(event.data);
                    }
                };

                // 녹음 시작
                mediaRecorder.start(100); // 100ms마다 데이터 수집
                
                // 주기적 인식 시작
                startPeriodicRecognition();
                
                onStart();
            } catch (error) {
                console.error('녹음 시작 오류:', error);
                isRecording = false;
                onError(error);
            }
        },
        stop: async () => {
            try {
                if (!isRecording) {
                    return;
                }

                    isRecording = false;

                // 주기적 인식 중지
                if (recognitionInterval) {
                    clearInterval(recognitionInterval);
                    recognitionInterval = null;
                }

                // MediaRecorder 중지
                if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                    mediaRecorder.stop();
                }

                // 최종 오디오 인식 (남은 모든 청크)
                return new Promise((resolve) => {
                    if (mediaRecorder) {
                        mediaRecorder.onstop = async () => {
                            if (audioChunks.length > 0) {
                                const finalAudioBlob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' });
                                await recognizeAudio(finalAudioBlob);
                            }
                            
                            // 스트림 정리
                            if (audioStream) {
                                audioStream.getTracks().forEach(track => track.stop());
                                audioStream = null;
                            }
                            
                            audioChunks = [];
                            mediaRecorder = null;
                            
                            onEnd('');
                            resolve();
                        };
                    } else {
                        resolve();
                    }
                });
            } catch (error) {
                console.error('녹음 중지 오류:', error);
                onError(error);
            }
        },
        abort: async () => {
            try {
                    isRecording = false;

                if (recognitionInterval) {
                    clearInterval(recognitionInterval);
                    recognitionInterval = null;
                }

                if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                    mediaRecorder.stop();
                }

                if (audioStream) {
                    audioStream.getTracks().forEach(track => track.stop());
                    audioStream = null;
                }

                audioChunks = [];
                mediaRecorder = null;
            } catch (error) {
                console.error('녹음 중단 오류:', error);
            }
        },
        isRecording: () => isRecording,
        getTranscript: () => '', // Google Cloud STT는 서버에서 처리하므로 클라이언트에 저장된 텍스트 없음
        clearTranscript: () => {},
        isSupported: true
    };
}

// 브라우저 환경에서는 전역으로 export
if (typeof window !== 'undefined') {
    window.GoogleCloudSTT = {
        initialize: initializeGoogleCloudSTT
    };
}
