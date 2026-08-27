#ifndef RelayVersion
  #define RelayVersion "0.1.0"
#endif

#define RelayName "Relay"
#define RelayPublisher "Relay"

[Setup]
AppId={{D0995D48-7086-4E82-BF38-B1C441558CE6}
AppName={#RelayName}
AppVersion={#RelayVersion}
AppVerName={#RelayName} {#RelayVersion}
AppPublisher={#RelayPublisher}
AppPublisherURL=https://github.com/kkkisme/Relay
AppSupportURL=https://github.com/kkkisme/Relay/issues
AppUpdatesURL=https://github.com/kkkisme/Relay/releases
DefaultDirName={localappdata}\Programs\Relay
DefaultGroupName=Relay
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\..\release
OutputBaseFilename=Relay-{#RelayVersion}-windows-x64-setup
SetupIconFile=..\..\assets\icon.ico
UninstallDisplayIcon={app}\relay.exe
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
ChangesEnvironment=no
VersionInfoVersion={#RelayVersion}.0
VersionInfoCompany={#RelayPublisher}
VersionInfoDescription=Relay installer
VersionInfoProductName={#RelayName}
VersionInfoProductVersion={#RelayVersion}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "..\..\dist\relay.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\dist\relay-core.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\dist\relay-helper.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\dist\mihomo.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\LICENSE"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\THIRD_PARTY_NOTICES.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\Relay"; Filename: "{app}\relay.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\Relay"; Filename: "{app}\relay.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\relay.exe"; Description: "{cm:LaunchProgram,Relay}"; WorkingDir: "{app}"; Flags: nowait postinstall skipifsilent
