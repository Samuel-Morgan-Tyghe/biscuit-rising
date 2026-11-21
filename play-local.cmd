@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
    py -3 --version >nul 2>nul
    if not errorlevel 1 (
        echo Open http://127.0.0.1:8000/ in your browser. Keep this window open while playing.
        py -3 -m http.server 8000 --bind 127.0.0.1
        pause
        exit /b
    )
)
where python >nul 2>nul
if not errorlevel 1 (
    python -c "import sys; sys.exit(sys.version_info.major != 3)" >nul 2>nul
    if not errorlevel 1 (
        echo Open http://127.0.0.1:8000/ in your browser. Keep this window open while playing.
        python -m http.server 8000 --bind 127.0.0.1
        pause
        exit /b
    )
)
echo Python 3 is required. Get it at https://www.python.org/downloads/ and run this file again.
pause
