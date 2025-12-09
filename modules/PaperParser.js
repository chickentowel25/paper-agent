const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

class PaperParser {
    /**
     * 논문 HTML 파일에서 텍스트 내용 추출
     * @param {string} paperPath - 논문 파일 경로
     * @returns {Promise<string>} - 추출된 텍스트 내용
     */
    async parsePaper(paperPath) {
        try {
            const fullPath = path.join(__dirname, '..', 'papers', paperPath);
            const htmlContent = fs.readFileSync(fullPath, 'utf-8');
            const $ = cheerio.load(htmlContent);

            // HTML 태그 제거하고 텍스트만 추출
            // 제목 추출
            const title = $('title').text() || $('h1').first().text();
            
            // 본문 내용 추출 (일반적으로 논문 내용이 있는 주요 섹션)
            let content = '';
            
            // 다양한 선택자로 본문 찾기
            const contentSelectors = [
                'article',
                '.article-content',
                '.abstract',
                '.section',
                'main',
                'body'
            ];

            for (const selector of contentSelectors) {
                const element = $(selector);
                if (element.length > 0) {
                    content = element.text();
                    break;
                }
            }

            // 선택자가 없으면 body 전체에서 스크립트와 스타일 제거
            if (!content) {
                $('script, style, nav, header, footer').remove();
                content = $('body').text();
            }

            // 공백 정리
            content = content.replace(/\s+/g, ' ').trim();
            
            // 제목과 내용 결합
            const fullText = title ? `${title}\n\n${content}` : content;
            
            return fullText;
        } catch (error) {
            console.error('논문 파싱 오류:', error);
            throw error;
        }
    }

    /**
     * 논문 목록 가져오기
     * @returns {Array} - 논문 파일명 목록
     */
    getPaperList() {
        try {
            const papersDir = path.join(__dirname, '..', 'papers');
            const files = fs.readdirSync(papersDir);
            
            // HTML 및 PDF 파일 필터링
            const paperFiles = files.filter(file => 
                file.endsWith('.html') || file.endsWith('.pdf')
            );
            
            return paperFiles.map(file => {
                // 파일명에서 확장자 제거하여 제목 생성
                const title = file
                    .replace(/\.(html|pdf)$/i, '')
                    .replace(/_/g, ' ');
                
                return {
                    filename: file,
                    title: title
                };
            });
        } catch (error) {
            console.error('논문 목록 가져오기 오류:', error);
            throw error;
        }
    }
}

module.exports = PaperParser;

