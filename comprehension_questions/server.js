const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 4000;

// 미들웨어 설정
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// logs_test 폴더가 없으면 생성
const logsDir = path.join(__dirname, '..', 'logs_test');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// 결과 저장 API
app.post('/api/save-result', (req, res) => {
    try {
        const { name, paper, mode, score, wrong_answers, timestamp } = req.body;
        
        if (!name || !paper) {
            return res.status(400).json({ 
                success: false, 
                error: '이름과 논문 번호는 필수입니다.' 
            });
        }
        
        // 파일명 생성: 사용자명_K#.json
        const fileName = `${name}_${paper}.json`;
        const filePath = path.join(logsDir, fileName);
        
        // JSON 데이터 생성
        const resultData = {
            name,
            paper,
            mode,
            score,
            wrong_answers: wrong_answers || [],
            timestamp: timestamp || new Date().toISOString()
        };
        
        // 파일 저장
        fs.writeFileSync(filePath, JSON.stringify(resultData, null, 2), 'utf8');
        
        console.log(`결과 저장됨: ${fileName}`);
        
        res.json({ 
            success: true, 
            message: '결과가 저장되었습니다.',
            filename: fileName
        });
    } catch (error) {
        console.error('결과 저장 오류:', error);
        res.status(500).json({ 
            success: false, 
            error: '결과 저장 중 오류가 발생했습니다.' 
        });
    }
});

// 서버 시작
app.listen(PORT, () => {
    console.log(`연구 이해도 평가 서버가 포트 ${PORT}에서 실행 중입니다.`);
    console.log(`접속: http://localhost:${PORT}`);
});

