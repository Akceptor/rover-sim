@echo off
cd /d "%~dp0"
node scripts\launch.mjs --choose-location %*
set "ROVER_EXIT_CODE=%ERRORLEVEL%"
if not "%ROVER_EXIT_CODE%"=="0" pause
exit /b %ROVER_EXIT_CODE%
