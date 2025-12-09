require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const PaperParser = require('./modules/PaperParser');
const PaperAgent = require('./modules/paperAgent');
const TTS = require('./modules/TTS');
const STT = require('./modules/STT');

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어 설정
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 정적 파일 서빙 (public 폴더)
app.use(express.static(path.join(__dirname, 'public')));

// 루트 경로는 home.html로 리다이렉트
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'home.html'));
});


// 모듈 인스턴스 생성
const paperParser = new PaperParser();
const tts = new TTS();
const stt = new STT();

// 세션 저장소 (실제 프로덕션에서는 Redis 등을 사용)
const sessions = new Map();

// 논문 목록 가져오기
app.get('/api/papers', (req, res) => {
    try {
        const papers = paperParser.getPaperList();
        res.json({ success: true, papers });
    } catch (error) {
        console.error('논문 목록 가져오기 오류:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 논문 내용 가져오기
app.get('/api/papers/:filename', async (req, res) => {
    try {
        // URL 디코딩 처리
        const filename = decodeURIComponent(req.params.filename);
        const content = await paperParser.parsePaper(filename);
        res.json({ success: true, content });
    } catch (error) {
        console.error('논문 내용 가져오기 오류:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 대화 세션 초기화
app.post('/api/conversation/initialize', async (req, res) => {
    try {
        const { paperFilename, mode } = req.body;

        if (!paperFilename || !mode) {
            return res.status(400).json({ 
                success: false, 
                error: '논문 파일명과 모드(talk/text)가 필요합니다.' 
            });
        }

        // 논문 파일 경로 생성
        const paperPath = path.join(__dirname, 'papers', paperFilename);
        
        // 논문 제목 추출 (파일명에서 확장자 제거)
        const paperTitle = paperFilename
            .replace(/\.(html|pdf)$/i, '')
            .replace(/_/g, ' ');

        // PaperAgent 인스턴스 생성
        const paperAgent = new PaperAgent({
            model: "o3",
            outputMode: mode === "talk" ? "plain" : "markdown",
            reasoningEffort: "low",
            verbosity: "medium", // o3 모델은 'medium'만 지원
            useWebSearch: true,
            mode: mode, // 'talk' 또는 'text'
        });

        // 논문 파일 업로드 및 설정
        await paperAgent.uploadPaperFromPath(paperPath, paperTitle);

        // 세션 ID 생성
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // 세션 저장 (PaperAgent 인스턴스 포함)
        sessions.set(sessionId, {
            paperFilename,
            paperTitle,
            mode,
            paperAgent, // PaperAgent 인스턴스 저장
            startTime: Date.now()
        });

        res.json({
            success: true,
            sessionId,
            initialMessage: null,
            audioBase64: null
        });
    } catch (error) {
        console.error('대화 초기화 오류:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 텍스트 모드: 사용자 메시지에 대한 응답 (스트리밍)
app.post('/api/conversation/text', async (req, res) => {
    try {
        const { sessionId, message } = req.body;

        if (!sessionId || !message) {
            return res.status(400).json({ 
                success: false, 
                error: '세션 ID와 메시지가 필요합니다.' 
            });
        }

        const session = sessions.get(sessionId);
        if (!session) {
            return res.status(404).json({ 
                success: false, 
                error: '세션을 찾을 수 없습니다.' 
            });
        }

        // SSE 헤더 설정
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // nginx 버퍼링 방지

        // PaperAgent를 사용하여 스트리밍 응답 생성
        const stream = await session.paperAgent.ask(message, {
            maxOutputTokens: 2048,
            stream: true
        });

        let fullResponse = '';
        let responseId = null;

        try {
            let chunkCount = 0;
            for await (const chunk of stream) {
                chunkCount++;
                // 디버깅: 청크 구조 확인 (첫 몇 개만)
                if (chunkCount <= 3) {
                    console.log(`스트리밍 청크 #${chunkCount}:`, JSON.stringify(chunk, null, 2));
                }

                // 응답 ID 저장 (첫 번째 청크에서)
                if (!responseId && chunk.id) {
                    responseId = chunk.id;
                    session.paperAgent.lastResponseId = chunk.id;
                }

                // 텍스트 추출 - Responses API 스트리밍 형식
                let text = '';
                
                // Responses API 스트리밍: type이 "response.output_text.delta"이고 delta가 문자열인 경우
                if (chunk.type === 'response.output_text.delta' && typeof chunk.delta === 'string') {
                    text = chunk.delta;
                }
                // 1. output_text가 직접 있는 경우
                else if (chunk.output_text) {
                    text = chunk.output_text;
                }
                // 2. delta에 output_text가 있는 경우
                else if (chunk.delta && chunk.delta.output_text) {
                    text = chunk.delta.output_text;
                }
                // 3. output 배열에서 추출
                else if (chunk.output && Array.isArray(chunk.output)) {
                    for (const item of chunk.output) {
                        if (item.type === 'message' && Array.isArray(item.content)) {
                            for (const content of item.content) {
                                if (content.type === 'output_text' && content.text) {
                                    text += content.text;
                                }
                            }
                        }
                    }
                }
                // 4. delta.output에서 추출
                else if (chunk.delta && chunk.delta.output && Array.isArray(chunk.delta.output)) {
                    for (const item of chunk.delta.output) {
                        if (item.type === 'message' && Array.isArray(item.content)) {
                            for (const content of item.content) {
                                if (content.type === 'output_text' && content.text) {
                                    text += content.text;
                                }
                            }
                        }
                    }
                }

                if (text) {
                    fullResponse += text;
                    // SSE 형식으로 전송
                    res.write(`data: ${JSON.stringify({ type: 'chunk', text: text })}\n\n`);
                }
            }

            // 완료 신호 전송
            console.log(`스트리밍 완료. 총 청크 수: ${chunkCount}, 전체 응답 길이: ${fullResponse.length}`);
            res.write(`data: ${JSON.stringify({ type: 'done', responseId: responseId })}\n\n`);
            res.end();
        } catch (streamError) {
            console.error('스트리밍 오류:', streamError);
            console.error('스트리밍 오류 스택:', streamError.stack);
            res.write(`data: ${JSON.stringify({ type: 'error', error: streamError.message })}\n\n`);
            res.end();
        }
    } catch (error) {
        console.error('텍스트 대화 오류:', error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: error.message });
        } else {
            res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
            res.end();
        }
    }
});

// STT: 오디오를 텍스트로 변환
app.post('/api/stt/recognize', async (req, res) => {
    try {
        const { audioBase64, encoding, sampleRateHertz } = req.body;

        if (!audioBase64) {
            return res.status(400).json({ 
                success: false, 
                error: '오디오 데이터가 필요합니다.' 
            });
        }

        // Base64를 Buffer로 변환
        const audioBuffer = Buffer.from(audioBase64, 'base64');

        // Google Cloud Speech로 인식
        const result = await stt.recognize(audioBuffer, {
            encoding: encoding || 'WEBM_OPUS',
            sampleRateHertz: sampleRateHertz || 48000,
            languageCode: 'ko-KR'
        });

        res.json({
            success: true,
            transcript: result.transcript,
            confidence: result.confidence,
            isFinal: result.isFinal
        });
    } catch (error) {
        console.error('STT 인식 오류:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 음성 모드: STT로 변환된 텍스트를 받아서 응답
app.post('/api/conversation/talk', async (req, res) => {
    try {
        const { sessionId, transcript } = req.body;

        if (!sessionId) {
            return res.status(400).json({ 
                success: false, 
                error: '세션 ID가 필요합니다.' 
            });
        }

        if (!transcript || transcript.trim() === '') {
            return res.status(400).json({ 
                success: false, 
                error: '음성 인식 텍스트(transcript)가 필요합니다.' 
            });
        }

        const session = sessions.get(sessionId);
        if (!session) {
            return res.status(404).json({ 
                success: false, 
                error: '세션을 찾을 수 없습니다.' 
            });
        }

        // Web Speech API로 변환된 텍스트 사용
        const userMessage = transcript.trim();

        // PaperAgent를 사용하여 응답 생성 (음성 모드는 200자 이내)
        // 한국어 기준으로 약 200자 = 약 100토큰 정도이지만, 안전하게 150토큰으로 설정
        const response = await session.paperAgent.ask(userMessage, {
            maxOutputTokens: 150
        });

        // TTS: 응답을 오디오로 변환
        const audioBase64 = await tts.synthesizeSpeechToBase64(response);

        res.json({
            success: true,
            userMessage,
            response,
            audioBase64
        });
    } catch (error) {
        console.error('음성 대화 오류:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 세션 종료 및 로그 저장
app.post('/api/conversation/end', (req, res) => {
    try {
        const { sessionId } = req.body;

        if (!sessionId) {
            return res.status(400).json({ 
                success: false, 
                error: '세션 ID가 필요합니다.' 
            });
        }

        const session = sessions.get(sessionId);
        if (!session) {
            return res.status(404).json({ 
                success: false, 
                error: '세션을 찾을 수 없습니다.' 
            });
        }

        // 로그 데이터 생성
        const logData = {
            sessionId,
            paperFilename: session.paperFilename,
            paperTitle: session.paperTitle,
            mode: session.mode,
            startTime: new Date(session.startTime).toISOString(),
            endTime: new Date().toISOString(),
            duration: Date.now() - session.startTime,
            // PaperAgent는 내부적으로 previous_response_id로 메모리를 관리하므로
            // conversationHistory는 별도로 저장하지 않음
        };

        // logs 폴더가 없으면 생성
        const logsDir = path.join(__dirname, 'logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }

        // 로그 파일 저장
        const logFilename = `session_${sessionId}_${Date.now()}.json`;
        const logPath = path.join(logsDir, logFilename);
        fs.writeFileSync(logPath, JSON.stringify(logData, null, 2), 'utf-8');

        // 세션 삭제
        sessions.delete(sessionId);

        res.json({
            success: true,
            message: '세션이 종료되었고 로그가 저장되었습니다.',
            logPath: logFilename
        });
    } catch (error) {
        console.error('세션 종료 오류:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 404 핸들러 (모든 라우트 이후에 배치)
app.use((req, res) => {
    // API 경로가 아닌 경우에만 HTML 파일 시도
    if (!req.path.startsWith('/api')) {
        res.status(404).sendFile(path.join(__dirname, 'public', 'home.html'));
    } else {
        res.status(404).json({ success: false, error: 'API 엔드포인트를 찾을 수 없습니다.' });
    }
});

// 에러 핸들러
app.use((err, req, res, next) => {
    console.error('서버 오류:', err);
    res.status(500).json({ success: false, error: err.message || '서버 내부 오류가 발생했습니다.' });
});

// 서버 시작
const HOST = '0.0.0.0'; // 모든 네트워크 인터페이스에서 접속 가능
app.listen(PORT, HOST, () => {
    const os = require('os');
    const networkInterfaces = os.networkInterfaces();
    let localIP = 'localhost';
    
    // 로컬 IP 주소 찾기
    for (const interfaceName in networkInterfaces) {
        const interfaces = networkInterfaces[interfaceName];
        for (const iface of interfaces) {
            // IPv4이고 내부 네트워크 주소인 경우
            if (iface.family === 'IPv4' && !iface.internal) {
                localIP = iface.address;
                break;
            }
        }
        if (localIP !== 'localhost') break;
    }
    
    console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
    console.log(`로컬 접속: http://localhost:${PORT}`);
    console.log(`네트워크 접속: http://${localIP}:${PORT}`);
    console.log(`\n모바일 기기에서 http://${localIP}:${PORT} 로 접속하세요.`);
});

