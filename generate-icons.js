// PWA 아이콘 생성 스크립트
// 사용법: node generate-icons.js
// 주의: 이 스크립트는 Canvas API를 사용하므로 Node.js 환경에서는 작동하지 않을 수 있습니다.
// 대신 온라인 도구나 이미지 편집 소프트웨어를 사용하세요.

// 아이콘 생성 가이드:
// 1. 192x192px와 512x512px 크기의 PNG 이미지를 생성하세요
// 2. 검은색 배경에 흰색 "P" 또는 Paper Agent 로고를 사용하세요
// 3. 파일명: icon-192.png, icon-512.png
// 4. public 폴더에 저장하세요

console.log(`
PWA 아이콘 생성 가이드:

1. 온라인 도구 사용:
   - https://realfavicongenerator.net/
   - https://www.pwabuilder.com/imageGenerator
   - https://favicon.io/

2. 또는 간단한 아이콘 생성:
   - 검은색 배경 (#000000)
   - 흰색 텍스트 "P" 또는 로고
   - 192x192px와 512x512px 크기
   - PNG 형식
   - public 폴더에 저장: icon-192.png, icon-512.png

3. 임시로 icon.svg를 사용하려면:
   - 온라인 SVG to PNG 변환 도구 사용
   - 또는 이미지 편집 소프트웨어에서 SVG를 열고 PNG로 저장
`);

