@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js。请在当前工作台开发电脑的完整项目目录中启动。
  pause
  exit /b 1
)
echo 正在启动本机工作台，沿用已保存的预览数据。
echo 工作台地址：http://127.0.0.1:8180/tool-hub?view=devices
echo 请保持此窗口打开；关闭窗口会停止工作台服务。
echo 已有工作台运行时，请使用原窗口，不要同时启动多份。
node "ops\retained-preview.mjs"
echo 工作台进程已结束。上方若显示连接锁占用，请检查已有工作台窗口。
pause
