@echo off
setlocal
chcp 65001 >nul
if not exist "%~dp0local-executor\start-connect.cmd" (
  echo 当前目录缺少完整连接组件。请打开与预览相同版本的项目，不要只复制此文件。
  pause
  exit /b 1
)
call "%~dp0local-executor\start-connect.cmd" %*
