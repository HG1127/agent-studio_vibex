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
Var UpdateMode
Var UpdateId
Var PreviousExecutable
PageEx directory
  DirText "请选择 Agent Studio 的专用程序文件夹。安装位置由你决定，运行临时文件也保存在所选目录。" "安装位置" "浏览…" "请选择安装目录"
  PageCallbacks "" "" VerifyLocation
PageExEnd
Page instfiles
Function .onInit
  ${GetParameters} $LaunchArgs
  StrCpy $TestMode 0
  StrCpy $UpdateMode 0
  ClearErrors
  ${GetOptions} $LaunchArgs "--desktop-update" $0
  IfErrors update_options_done
    StrCpy $UpdateMode 1
    ClearErrors
    ${GetOptions} $LaunchArgs "--desktop-update-id=" $UpdateId
    IfErrors invalid_update_target
    StrLen $0 $UpdateId
    ${If} $0 != 36
      Goto invalid_update_target
    ${EndIf}
    IfFileExists "$INSTDIR\temp\desktop-updates\$UpdateId\job.json" update_target_valid invalid_update_target
    invalid_update_target:
      SetErrorLevel 2
      Quit
    update_target_valid:
    StrCpy $LaunchArgs ""
  update_options_done:
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
    SetErrorLevel 2
    MessageBox MB_OK|MB_ICONSTOP "请选择安装目录。" /SD IDOK
    Abort
  ${EndIf}
  ${GetRoot} "$INSTDIR" $0
  ${If} $INSTDIR == $0
    SetErrorLevel 2
    MessageBox MB_OK|MB_ICONSTOP "请为 Agent Studio 选择专用文件夹，不要直接选择磁盘根目录。" /SD IDOK
    Abort
  ${EndIf}
  System::Call 'kernel32::GetDiskFreeSpaceExW(w "$0", *l .r1, p 0, p 0) i.r0'
  ${If} $0 != 0
    System::Int64Op $1 < ${REQUIRED_BYTES}
    Pop $0
    ${If} $0 == 1
      SetErrorLevel 2
      MessageBox MB_OK|MB_ICONSTOP "所选磁盘空间不足，请选择至少有 ${REQUIRED_MB} MB 可用空间的位置。" /SD IDOK
      Abort
    ${EndIf}
  ${EndIf}
FunctionEnd
Section "安装 Agent Studio"
  Call VerifyLocation
  StrCpy $InstallRoot "$INSTDIR"
  ; Fail before touching the installation when an old/manual launch still owns
  ; an executable or a mapped Chromium resource. This also protects old updaters.
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File /oname=studio-update-guard.exe "${APP_DIR}\resources\update-guard\update-guard.exe"
  nsExec::ExecToStack /TIMEOUT=30000 '"$PLUGINSDIR\studio-update-guard.exe" --check "$InstallRoot"'
  Pop $VerificationExit
  Pop $VerificationOutput
  ${If} $VerificationExit != "0"
    SetErrorLevel 2
    MessageBox MB_OK|MB_ICONSTOP "程序仍在运行或文件被占用，尚未修改安装文件。请从旧版菜单退出并停止本机连接，再重试安装。" /SD IDOK
    Quit
  ${EndIf}
  StrCpy $INSTDIR "\\?\$InstallRoot"
  CreateDirectory "$INSTDIR"
  ClearErrors
  FileOpen $0 "$INSTDIR\.write-check" w
  ${If} ${Errors}
    SetErrorLevel 2
    MessageBox MB_OK|MB_ICONSTOP "无法写入所选目录，请选择自己可写的程序文件夹。" /SD IDOK
    Quit
  ${EndIf}
  FileClose $0
  Delete "$INSTDIR\.write-check"
  ; Publish the new startup guard before replacing the executable. During the
  ; swap the old launch path is unavailable, then the new guard blocks reopens.
  System::Call 'kernel32::GetCurrentProcessId() i .r0'
  StrCpy $PreviousExecutable "$InstallRoot\.studio-before-${VERSION}-$0.exe"
  IfFileExists "$PreviousExecutable" 0 previous_slot_available
    SetErrorLevel 2
    Quit
  previous_slot_available:
  ClearErrors
  FileOpen $0 "$INSTDIR\.studio-update-in-progress" w
  ${If} ${Errors}
    SetErrorLevel 2
    Quit
  ${EndIf}
  ${If} $UpdateMode == 1
    FileWrite $0 "$UpdateId"
  ${Else}
    FileWrite $0 "standalone-install"
  ${EndIf}
  FileClose $0
  IfFileExists "$InstallRoot\Agent Studio.exe" 0 old_executable_moved
    ClearErrors
    Rename "$InstallRoot\Agent Studio.exe" "$PreviousExecutable"
    ${If} ${Errors}
      ${If} $UpdateMode == 0
        Delete "$INSTDIR\.studio-update-in-progress"
      ${EndIf}
      SetErrorLevel 2
      MessageBox MB_OK|MB_ICONSTOP "原程序仍被占用，尚未替换程序文件。请退出旧版后重试。" /SD IDOK
      Quit
    ${EndIf}
  old_executable_moved:
  SetOutPath "$INSTDIR\resources"
  File /oname=app.asar "${APP_DIR}\resources\app.asar"
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
    SetErrorLevel 2
    MessageBox MB_OK|MB_ICONSTOP "安装文件未通过完整性核对，请检查磁盘和写入权限后重试。详细信息：$VerificationOutput" /SD IDOK
    Quit
  verified:
  CreateDirectory "$INSTDIR\temp"
  CreateDirectory "$INSTDIR\web-cache"
  FileOpen $0 "$INSTDIR\.studio-install-complete" w
  FileWrite $0 "${VERSION}$\r$\n"
  FileClose $0
  Delete "$PreviousExecutable"
  ${If} $UpdateMode == 1
    SetErrorLevel 0
    Quit
  ${EndIf}
  Delete "$INSTDIR\.studio-update-in-progress"
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
    MessageBox MB_OK|MB_ICONSTOP "安装已完成，但程序没有打开。请从所选目录运行 Agent Studio.exe，并核对系统提示。" /SD IDOK
    Quit
  ${EndIf}
  SetErrorLevel $LaunchExit
SectionEnd
