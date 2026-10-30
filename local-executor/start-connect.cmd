@echo off
setlocal
chcp 65001 >nul
rem Developer source launcher; normal users should use the packaged connector.
where node >nul 2>nul
if errorlevel 1 (
  echo 需要 Node.js 24，并在完整项目目录中运行此开发入口。
  pause
  exit /b 1
)
node "%~dp0desktop.mjs" %*
exit /b %errorlevel%
