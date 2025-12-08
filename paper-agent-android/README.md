# Paper Agent Android

웹앱과 동일한 기능을 제공하는 순수 Android 네이티브 앱입니다.

## 프로젝트 구조

- **Empty Activity** 기반으로 생성된 순수 Android 프로젝트
- **WebView**를 사용하여 웹앱을 로드
- Capacitor 없이 순수 Android로 구현

## 주요 기능

- 논문 선택 및 모드 선택 (Text/Talk)
- WebView를 통한 웹앱 로드
- HTTP cleartext 트래픽 지원
- 음성 인식 권한 지원
- 풀스크린 모드

## 설정

### 서버 URL 변경

`MainActivity.java` 파일에서 서버 URL을 변경할 수 있습니다:

```java
private static final String SERVER_URL = "http://169.254.158.38:3000";
```

### 네트워크 보안 설정

`app/src/main/res/xml/network_security_config.xml` 파일에서 허용할 도메인을 추가할 수 있습니다.

## 빌드 및 실행

1. Android Studio에서 프로젝트 열기
2. `paper-agent-android` 폴더를 프로젝트로 선택
3. Gradle 동기화
4. 실행

## 필요한 권한

- `INTERNET`: 서버 연결
- `RECORD_AUDIO`: 음성 인식 (Talk 모드)
- `MODIFY_AUDIO_SETTINGS`: 오디오 설정
- `ACCESS_NETWORK_STATE`: 네트워크 상태 확인

## 참고사항

- 서버가 실행 중이어야 앱이 정상 작동합니다
- 개발 서버 URL은 `http://169.254.158.38:3000`로 설정되어 있습니다
- 아이콘 리소스는 기존 `android/app/src/main/res/mipmap-*` 폴더에서 복사하거나 Android Studio에서 생성할 수 있습니다

