; ============================================================
; FALCONT HUB - OFFICIAL INNO SETUP SCRIPT (.ISS)
; Lanzamiento 100% Silencioso y Estético (Sin Cuadro Negro CMD)
; ============================================================

#define MyAppName "FALCONT HUB"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "FALCONT Despacho Contable"
#define MyAppURL "https://falcont.com.mx"
#define MyAppExeName "Iniciar FALCONT HUB.vbs"

[Setup]
AppId={{E48F971G-003B-5F8E-9G36-D8F7D2015E02}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
DefaultDirName={userappdata}\{#MyAppName}
DisableProgramGroupPage=yes
OutputDir=OutputInstaller
OutputBaseFilename=FALCONT_HUB_Setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
SetupIconFile=public\favicon.svg

[Languages]
Name: "default"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "OutputInstaller\FALCONT_HUB_Package\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{userprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{userdesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: shellexec postinstall skipifsilent
