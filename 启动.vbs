' 火柴人知识卡片智能体 · 备用启动器（绕过个别机器 .bat 关联异常）
' 作用：用 cmd 显式执行同目录下的 启动.bat（bat 内含 Node 自动探测），不依赖系统 .bat 关联。
Set ws = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
appdir = fso.GetParentFolderName(WScript.ScriptFullName)
bat = appdir & "\启动.bat"
If Not fso.FileExists(bat) Then
    MsgBox "未找到同目录的 启动.bat，请确认文件完整。", vbCritical, "启动失败"
    WScript.Quit 1
End If
ws.Run "cmd.exe /c """"" & bat & """""", 1, False
