require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const PaperParser = require('./modules/PaperParser');
const OpenAIService = require('./modules/LLM');
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
const openAIService = new OpenAIService();
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

        // 논문 내용 파싱
        const paperContent = await paperParser.parsePaper(paperFilename);

        // 세션 ID 생성
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // 세션 저장 (사용자가 먼저 시작하므로 빈 대화 히스토리로 시작)
        sessions.set(sessionId, {
            paperFilename,
            paperContent,
            mode,
            conversationHistory: [],
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

// 텍스트 모드: 사용자 메시지에 대한 응답
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

        // 사용자 메시지를 히스토리에 추가
        session.conversationHistory.push({
            role: 'user',
            content: message
        });

        // AI 응답 생성
        const response = await openAIService.generateResponse(
            session.paperContent,
            session.conversationHistory,
            session.mode
        );

        // AI 응답을 히스토리에 추가
        session.conversationHistory.push({
            role: 'assistant',
            content: response
        });

        res.json({
            success: true,
            response
        });
    } catch (error) {
        console.error('텍스트 대화 오류:', error);
        res.status(500).json({ success: false, error: error.message });
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

        // 사용자 메시지를 히스토리에 추가
        session.conversationHistory.push({
            role: 'user',
            content: userMessage
        });

        // AI 응답 생성
        const response = await openAIService.generateResponse(
            session.paperContent,
            session.conversationHistory,
            session.mode
        );

        // AI 응답을 히스토리에 추가
        session.conversationHistory.push({
            role: 'assistant',
            content: response
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
            mode: session.mode,
            startTime: new Date(session.startTime).toISOString(),
            endTime: new Date().toISOString(),
            duration: Date.now() - session.startTime,
            conversationHistory: session.conversationHistory
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

