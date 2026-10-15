@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  echo Open http://127.0.0.1:8765 in Chrome or Edge
  start "" "http://127.0.0.1:8765"
  py -3 -m http.server 8765 --bind 127.0.0.1
  goto :end
)
where python >nul 2>nul
if %errorlevel%==0 (
  echo Open http://127.0.0.1:8765 in Chrome or Edge
  start "" "http://127.0.0.1:8765"
  python -m http.server 8765 --bind 127.0.0.1
  goto :end
)
where node >nul 2>nul
if %errorlevel%==0 (
  echo Open http://127.0.0.1:8765 in Chrome or Edge
  start "" "http://127.0.0.1:8765"
  node server.mjs
  goto :end
)
echo Python 3 or Node.js is required for the local server.
echo Read README.md for details.
:end
pause
