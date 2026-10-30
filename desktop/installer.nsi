Unicode true
RequestExecutionLevel user
CRCCheck force
SetCompressor zlib
SetCompress auto
SetDatablockOptimize off
Name "Agent Studio"
Caption "Agent Studio · 选择安装位置"
OutFile "${OUTPUT}"
Icon "${ICON_FILE}"
BrandingText "Agent Studio"
AutoCloseWindow true
ShowInstDetails nevershow
InstallButtonText "安装并打开"
InstallDir ""
!include "LogicLib.nsh"
!include "FileFunc.nsh"
Var InstallRoot
Var LaunchArgs
Var LaunchExit
Var VerificationExit
Var VerificationOutput
Var TestMode
PageEx directory
  DirText "请选择 Agent Studio 的专用程序文件夹。安装位置由你决定，运行临时文件也保存在所选目录。" "安装位置" "浏览…" "请选择安装目录"
  PageCallbacks "" "" VerifyLocation
PageExEnd
Page instfiles
Function .onInit
  ${GetParameters} $LaunchArgs
  StrCpy $TestMode 0
  ClearErrors
  ${GetOptions} $LaunchArgs "--desktop-test-home=" $0
  IfErrors normal_run
    StrCpy $TestMode 1
  normal_run:
  ; NSIS consumes /D before .onInit and removes it from $CMDLINE. Preserve
  ; its selected $INSTDIR, applying a default only when no choice was supplied.
  ${If} $INSTDIR == ""
    ${GetRoot} "$EXEDIR" $0
    ${GetRoot} "$WINDIR" $1
    ${If} $0 != $1
      StrCpy $INSTDIR "$0\Agent Studio"
    ${EndIf}
  ${EndIf}
FunctionEnd
Function VerifyLocation
  ${If} $INSTDIR == ""
    MessageBox MB_OK|MB_ICONSTOP "请选择安装目录。"
    Abort
  ${EndIf}
  ${GetRoot} "$INSTDIR" $0
  ${If} $INSTDIR == $0
    MessageBox MB_OK|MB_ICONSTOP "请为 Agent Studio 选择专用文件夹，不要直接选择磁盘根目录。"
    Abort
  ${EndIf}
  System::Call 'kernel32::GetDiskFreeSpaceExW(w "$0", *l .r1, p 0, p 0) i.r0'
  ${If} $0 != 0
    System::Int64Op $1 < ${REQUIRED_BYTES}
    Pop $0
    ${If} $0 == 1
      MessageBox MB_OK|MB_ICONSTOP "所选磁盘空间不足，请选择至少有 ${REQUIRED_MB} MB 可用空间的位置。"
      Abort
    ${EndIf}
  ${EndIf}
FunctionEnd
Section "安装 Agent Studio"
  Call VerifyLocation
  StrCpy $InstallRoot "$INSTDIR"
  StrCpy $INSTDIR "\\?\$InstallRoot"
  CreateDirectory "$INSTDIR"
  ClearErrors
  FileOpen $0 "$INSTDIR\.write-check" w
  ${If} ${Errors}
    MessageBox MB_OK|MB_ICONSTOP "无法写入所选目录，请选择自己可写的程序文件夹。"
    Quit
  ${EndIf}
  FileClose $0
  Delete "$INSTDIR\.write-check"
  SetOutPath "$INSTDIR"
  File /r "${APP_DIR}\*.*"
  File /oname=.studio-verify.cjs "${VERIFY_SCRIPT}"
  File /oname=.studio-files.json "${VERIFY_MANIFEST}"
  ; Extended-path metadata flags are not a reliable copy result. Verify every
  ; installed file against its embedded SHA-256 before starting the app.
  ClearErrors
  DetailPrint "正在逐项核对安装文件……"
  nsExec::ExecToStack /TIMEOUT=180000 '"$InstallRoot\resources\connector\runtime\node.exe" "$InstallRoot\.studio-verify.cjs" "$InstallRoot"'
  Pop $VerificationExit
  Pop $VerificationOutput
  StrCmp $VerificationExit "0" verified
    MessageBox MB_OK|MB_ICONSTOP "安装文件未通过完整性核对，请检查磁盘和写入权限后重试。详细信息：$VerificationOutput"
    Quit
  verified:
  CreateDirectory "$INSTDIR\temp"
  CreateDirectory "$INSTDIR\web-cache"
  FileOpen $0 "$INSTDIR\.studio-install-complete" w
  FileWrite $0 "${VERSION}$\r$\n"
  FileClose $0
  ${If} $TestMode == 0
    CreateShortCut "$DESKTOP\Agent Studio.lnk" "$InstallRoot\Agent Studio.exe" "" "$InstallRoot\Agent Studio.exe"
  ${EndIf}
  SetOutPath "$InstallRoot"
  System::Call 'kernel32::SetEnvironmentVariableW(w "TEMP", w "$InstallRoot\temp")'
  System::Call 'kernel32::SetEnvironmentVariableW(w "TMP", w "$InstallRoot\temp")'
  System::Call 'kernel32::SetEnvironmentVariableW(w "TMPDIR", w "$InstallRoot\temp")'
  HideWindow
  ClearErrors
  ExecWait '"$InstallRoot\Agent Studio.exe" $LaunchArgs' $LaunchExit
  ${If} ${Errors}
    MessageBox MB_OK|MB_ICONSTOP "安装已完成，但程序没有打开。请从所选目录运行 Agent Studio.exe，并核对系统提示。"
    Quit
  ${EndIf}
  SetErrorLevel $LaunchExit
SectionEnd
