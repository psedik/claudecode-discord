@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

:: Claude Discord Bot - Windows Auto-update & Start Script
:: 사용법:
::   win-start.bat          → 백그라운드 실행 (작업 스케줄러 등록)
::   win-start.bat --fg     → 포그라운드 실행 (디버깅용)
::   win-start.bat --stop   → 중지
::   win-start.bat --status → 상태 확인

set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "ENV_FILE=%SCRIPT_DIR%\.env"
set "TASK_NAME=ClaudeDiscordBot"
set "TRAY_EXE=%SCRIPT_DIR%\tray\ClaudeBotTray.exe"
set "TRAY_SRC=%SCRIPT_DIR%\tray\ClaudeBotTray.cs"

:: .env 파일 없으면 초기 설정
if not exist "%ENV_FILE%" (
    echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    echo   Claude Discord Bot - 초기 설정
    echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    echo.

    set /p "BOT_TOKEN=Discord Bot Token: "
    if "!BOT_TOKEN!"=="" (
        echo ❌ Bot Token은 필수입니다
        exit /b 1
    )

    set /p "GUILD_ID=Discord Guild(서버) ID: "
    if "!GUILD_ID!"=="" (
        echo ❌ Guild ID는 필수입니다
        exit /b 1
    )

    set /p "USER_IDS=허용할 Discord User ID (여러 명이면 쉼표 구분): "
    if "!USER_IDS!"=="" (
        echo ❌ User ID는 필수입니다
        exit /b 1
    )

    set /p "PROJECT_DIR=프로젝트 기본 디렉토리 [%CD%]: "
    if "!PROJECT_DIR!"=="" set "PROJECT_DIR=%CD%"

    set /p "RATE_LIMIT=분당 요청 제한 [10]: "
    if "!RATE_LIMIT!"=="" set "RATE_LIMIT=10"

    echo.
    echo Max 플랜 사용자는 비용이 표시되지 않으므로 false 권장
    set /p "SHOW_COST=비용 표시 (true/false) [true]: "
    if "!SHOW_COST!"=="" set "SHOW_COST=true"

    (
        echo DISCORD_BOT_TOKEN=!BOT_TOKEN!
        echo DISCORD_GUILD_ID=!GUILD_ID!
        echo ALLOWED_USER_IDS=!USER_IDS!
        echo BASE_PROJECT_DIR=!PROJECT_DIR!
        echo RATE_LIMIT_PER_MINUTE=!RATE_LIMIT!
        echo SHOW_COST=!SHOW_COST!
    ) > "%ENV_FILE%"

    echo.
    echo ✅ .env 파일이 생성되었습니다
    echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    echo.
)

:: node 경로 확인
where node >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js를 찾을 수 없습니다
    exit /b 1
)

:: --stop: 중지
if "%~1"=="--stop" (
    schtasks /end /tn "%TASK_NAME%" >nul 2>&1
    schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1
    :: 봇 프로세스 종료
    for /f "tokens=2" %%a in ('tasklist /fi "windowtitle eq ClaudeDiscordBot" /fo list 2^>nul ^| findstr "PID"') do (
        taskkill /pid %%a /f >nul 2>&1
    )
    :: node 프로세스 중 봇 관련 종료
    wmic process where "commandline like '%%dist/index.js%%' and name='node.exe'" call terminate >nul 2>&1
    :: 트레이 앱 종료
    taskkill /im ClaudeBotTray.exe /f >nul 2>&1
    echo 🔴 봇 중지됨
    exit /b 0
)

:: --status: 상태 확인
if "%~1"=="--status" (
    schtasks /query /tn "%TASK_NAME%" >nul 2>&1
    if errorlevel 1 (
        echo 🔴 봇 중지됨
    ) else (
        echo 🟢 봇 등록됨
        wmic process where "commandline like '%%dist/index.js%%' and name='node.exe'" get processid 2>nul | findstr /r "[0-9]" >nul 2>&1
        if errorlevel 1 (
            echo    프로세스: 중지됨
        ) else (
            echo    프로세스: 실행 중
        )
    )
    exit /b 0
)

:: --fg: 포그라운드 실행
if "%~1"=="--fg" (
    cd /d "%SCRIPT_DIR%"

    for /f %%i in ('git describe --tags --always 2^>nul') do set "VERSION=%%i"
    if "!VERSION!"=="" set "VERSION=unknown"
    echo [claude-bot] 현재 버전: !VERSION!
    echo [claude-bot] Git 업데이트 확인 중...
    git fetch origin main >nul 2>&1

    for /f %%i in ('git rev-parse HEAD 2^>nul') do set "LOCAL=%%i"
    for /f %%i in ('git rev-parse origin/main 2^>nul') do set "REMOTE=%%i"

    if not "!LOCAL!"=="!REMOTE!" (
        if not "!LOCAL!"=="" (
            if not "!REMOTE!"=="" (
                echo [claude-bot] 업데이트가 있습니다 ^(트레이에서 업데이트 가능^)
            )
        )
    ) else (
        echo [claude-bot] 최신 버전입니다
    )

    if not exist "dist" (
        echo [claude-bot] 빌드 파일 없음, 빌드 중...
        call npm run build
    )

    echo [claude-bot] 봇 시작 ^(포그라운드^)...
    node dist/index.js
    exit /b 0
)

:: 기본: 백그라운드 실행
cd /d "%SCRIPT_DIR%"

:: 이미 실행 중이면 종료 후 재시작
schtasks /query /tn "%TASK_NAME%" >nul 2>&1
if not errorlevel 1 (
    echo 🔄 기존 봇 종료 중...
    schtasks /end /tn "%TASK_NAME%" >nul 2>&1
    schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1
    wmic process where "commandline like '%%dist/index.js%%' and name='node.exe'" call terminate >nul 2>&1
    timeout /t 2 /nobreak >nul
)

:: 업데이트 체크 (자동 업데이트 안 함, 트레이에서 수동)
echo [claude-bot] Git 업데이트 확인 중...
git fetch origin main >nul 2>&1
for /f %%i in ('git rev-parse HEAD 2^>nul') do set "LOCAL=%%i"
for /f %%i in ('git rev-parse origin/main 2^>nul') do set "REMOTE=%%i"

if not "!LOCAL!"=="!REMOTE!" (
    if not "!LOCAL!"=="" (
        if not "!REMOTE!"=="" (
            echo [claude-bot] 업데이트가 있습니다 ^(트레이에서 업데이트 가능^)
        )
    )
) else (
    echo [claude-bot] 최신 버전입니다
)

if not exist "dist" (
    echo [claude-bot] 빌드 파일 없음, 빌드 중...
    call npm run build
)

:: 작업 스케줄러 등록 (부팅 시 자동 실행)
schtasks /create /tn "%TASK_NAME%" /tr "\"%SCRIPT_DIR%\win-start.bat\" --fg" /sc onlogon /rl highest /f >nul 2>&1

:: 봇 백그라운드 실행
start "ClaudeDiscordBot" /min cmd /c "cd /d %SCRIPT_DIR% && node dist/index.js"

:: 트레이 앱 컴파일 (exe 없으면)
if not exist "%TRAY_EXE%" (
    if exist "%TRAY_SRC%" (
        echo 🔨 트레이 앱 빌드 중...
        :: .NET Framework csc.exe 찾기
        set "CSC="
        for /f "delims=" %%i in ('dir /b /s "%WINDIR%\Microsoft.NET\Framework64\csc.exe" 2^>nul') do set "CSC=%%i"
        if "!CSC!"=="" (
            for /f "delims=" %%i in ('dir /b /s "%WINDIR%\Microsoft.NET\Framework\csc.exe" 2^>nul') do set "CSC=%%i"
        )
        if not "!CSC!"=="" (
            "!CSC!" /nologo /target:winexe /out:"%TRAY_EXE%" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll "%TRAY_SRC%" >nul 2>&1
        )
    )
)

:: 트레이 앱 실행
if exist "%TRAY_EXE%" (
    taskkill /im ClaudeBotTray.exe /f >nul 2>&1
    start "" "%TRAY_EXE%"
    echo 🟢 봇이 백그라운드에서 시작되었습니다 ^(트레이 표시^)
) else (
    echo 🟢 봇이 백그라운드에서 시작되었습니다
)
echo    중지: win-start.bat --stop
echo    상태: win-start.bat --status
echo    로그: type bot.log
