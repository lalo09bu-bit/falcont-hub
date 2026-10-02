Dim WshShell, fso, scriptPath, appDir, nodeExe, serverScript, localAppData, falcontProfile, edgeCmd
Dim http, isReady, i

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Obtener la carpeta del programa
scriptPath = WScript.ScriptFullName
appDir = fso.GetParentFolderName(scriptPath)

' Fijar el directorio de trabajo a la carpeta del programa
WshShell.CurrentDirectory = appDir

' Detectar ejecutable de Node.js (bin\node.exe portable o del sistema)
nodeExe = appDir & "\bin\node.exe"
If Not fso.FileExists(nodeExe) Then
    nodeExe = "node"
End If

serverScript = appDir & "\server\server.js"

' 1. Iniciar servidor Node.js de forma 100% invisible en segundo plano (SW_HIDE = 0)
WshShell.Run """" & nodeExe & """ """ & serverScript & """", 0, False

' 2. Verificación activa en bucle de http://localhost:9060/api/health usando MSXML2
isReady = False
For i = 1 To 25
    On Error Resume Next
    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    http.setTimeouts 1000, 1000, 1000, 1000
    http.Open "GET", "http://localhost:9060/api/health", False
    http.Send
    If Err.Number = 0 Then
        If http.Status = 200 Then
            isReady = True
            Set http = Nothing
            Exit For
        End If
    End If
    Err.Clear
    On Error GoTo 0
    Set http = Nothing
    WScript.Sleep 400
Next

' 3. Lanzar la ventana en modo ejecutable nativo de escritorio (Edge / Chrome / Navegador Predeterminado)
localAppData = WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%")
falcontProfile = localAppData & "\FALCONT_Hub_Profile"

edgeCmd = "msedge --app=http://localhost:9060 --user-data-dir=""" & falcontProfile & """ --window-size=1360,860"

On Error Resume Next
WshShell.Run edgeCmd, 1, False
If Err.Number <> 0 Then
    Err.Clear
    WshShell.Run "chrome --app=http://localhost:9060 --user-data-dir=""" & falcontProfile & """ --window-size=1360,860", 1, False
    If Err.Number <> 0 Then
        Err.Clear
        WshShell.Run "http://localhost:9060", 1, False
    End If
End If
On Error GoTo 0

Set WshShell = Nothing
Set fso = Nothing
