@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"

REM 自动探测 Node 运行时（朋友机器无需安装 WorkBuddy）
set "NODE="
where node >nul 2>&1
if not errorlevel 1 (
  for /f "delims=" %%i in ('where node') do (
    if not defined NODE set "NODE=%%i"
  )
)
if not defined NODE if exist "%~dp0node\node.exe" set "NODE=%~dp0node\node.exe"
if not defined NODE if exist "C:\Program Files\nodejs\node.exe" set "NODE=C:\Program Files\nodejs\node.exe"
if not defined NODE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE if exist "C:\Users\lenovo\.workbuddy\binaries\node\versions\22.22.2\node.exe" set "NODE=C:\Users\lenovo\.workbuddy\binaries\node\versions\22.22.2\node.exe"
if not defined NODE goto NOPY

set "APPDIR=%~dp0"
echo 正在启动国风知识卡片智能体 ...
echo 浏览器会自动打开，关闭本窗口即停止服务。
echo.

start "" /MIN "%NODE%" "%APPDIR%server.js" >> "%APPDIR%启动日志.txt" 2>&1

REM 等待本地服务就绪，最多 15 秒
set /a count=0
:WAIT
powershell -NoProfile -Command "try{ (New-Object Net.Sockets.TcpClient('127.0.0.1',8788)).Close(); exit 0 }catch{ exit 1 }" >nul 2>&1
if %errorlevel%==0 goto READY
if %count% GEQ 15 goto TIMEOUT
set /a count+=1
timeout /t 1 /nobreak >nul
goto WAIT

:TIMEOUT
echo 等待服务启动超时，请查看「启动日志.txt」排查。
echo.
pause
goto END

:READY
start "" "http://127.0.0.1:8788"
echo.
echo 服务已启动：http://127.0.0.1:8788
echo 如果浏览器没有自动打开，请手动复制上方地址访问。
echo.
pause
goto END

:NOPY
echo 未检测到 Node.js 运行时。
echo 请先到 https://nodejs.org 下载安装 Node.js（LTS 版），安装时勾选 Add to PATH。
echo 安装完成后重新双击本文件即可。
echo.
pause

:END
