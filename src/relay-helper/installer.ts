import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { chmodSync, copyFileSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import type { HelperConfig } from './protocol'

function xml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
}

function systemConfigPath(platform = process.platform, environment = process.env) {
  if (platform === 'win32') return join(environment.PROGRAMDATA ?? 'C:\\ProgramData', 'Relay', 'helper.json')
  if (platform === 'darwin') return '/Library/Application Support/Relay/helper.json'
  return '/etc/relay/helper.json'
}

function systemBinaryPaths(platform = process.platform, environment = process.env) {
  if (platform === 'win32') {
    const root = join(environment.ProgramFiles ?? 'C:\\Program Files', 'Relay')
    return { root, helper: join(root, 'relay-helper.exe'), mihomo: join(root, 'mihomo.exe') }
  }
  if (platform === 'darwin') {
    const root = '/Library/PrivilegedHelperTools'
    return { root, helper: join(root, 'app.relay.helper'), mihomo: join(root, 'app.relay.mihomo') }
  }
  const root = '/usr/lib/relay'
  return { root, helper: join(root, 'relay-helper'), mihomo: join(root, 'mihomo') }
}

function systemRuntimeRoot(platform = process.platform, environment = process.env) {
  if (platform === 'win32') return join(environment.PROGRAMDATA ?? 'C:\\ProgramData', 'Relay', 'runtime')
  if (platform === 'darwin') return '/Library/Application Support/Relay/runtime'
  return '/var/lib/relay'
}

function sha256(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function quoteSystemd(value: string) {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

function powershell(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

export function installHelper(sourcePath: string, platform = process.platform) {
  if (!['win32', 'darwin', 'linux'].includes(platform)) throw new Error('Relay Helper is unsupported on this platform')
  const source = JSON.parse(readFileSync(sourcePath, 'utf8')) as HelperConfig
  validateConfig(source)
  const packagedMihomo = join(dirname(process.execPath), platform === 'win32' ? 'mihomo.exe' : 'mihomo')
  if (resolve(source.mihomoBinary) !== resolve(packagedMihomo)) {
    throw new Error('Relay Helper only accepts the packaged Mihomo binary beside itself')
  }
  if (sha256(source.mihomoBinary) !== source.mihomoSha256) throw new Error('Mihomo changed during Relay Helper installation')
  stopExisting(platform)
  const binaries = systemBinaryPaths(platform)
  mkdirSync(binaries.root, { recursive: true })
  copyIfDifferent(process.execPath, binaries.helper)
  copyIfDifferent(source.mihomoBinary, binaries.mihomo)
  if (platform !== 'win32') {
    chmodSync(binaries.helper, 0o755)
    chmodSync(binaries.mihomo, 0o755)
  }
  const config: HelperConfig = {
    ...source,
    runtimeRoot: systemRuntimeRoot(platform),
    helperBinary: binaries.helper,
    mihomoBinary: binaries.mihomo,
    mihomoSha256: sha256(binaries.mihomo),
  }
  mkdirSync(config.runtimeRoot, { recursive: true, mode: 0o700 })
  const destination = systemConfigPath(platform)
  mkdirSync(dirname(destination), { recursive: true })
  const temporary = `${destination}.${randomUUID()}.tmp`
  writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
  renameSync(temporary, destination)
  if (platform === 'win32') secureWindowsData(dirname(destination))

  if (platform === 'win32') installWindows(config, destination)
  else if (platform === 'darwin') installMac(config, destination)
  else if (platform === 'linux') installLinux(config, destination)
  else throw new Error('Relay Helper is unsupported on this platform')
}

function secureWindowsData(path: string) {
  execFileSync('icacls.exe', [
    path,
    '/inheritance:r',
    '/grant:r',
    '*S-1-5-18:(OI)(CI)F',
    '*S-1-5-32-544:(OI)(CI)F',
  ])
}

function copyIfDifferent(source: string, destination: string) {
  if (resolve(source) !== resolve(destination)) copyFileSync(source, destination)
}

function stopExisting(platform: NodeJS.Platform) {
  try {
    if (platform === 'win32') {
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "Stop-ScheduledTask -TaskName 'Relay Privileged Helper' -ErrorAction SilentlyContinue"])
    } else if (platform === 'darwin') {
      execFileSync('/bin/launchctl', ['bootout', 'system/app.relay.helper'], { stdio: 'ignore' })
    } else if (platform === 'linux') {
      execFileSync('systemctl', ['stop', 'relay-helper.service'], { stdio: 'ignore' })
    }
  } catch {}
}

export function uninstallHelper(platform = process.platform) {
  const destination = systemConfigPath(platform)
  const binaries = systemBinaryPaths(platform)
  if (platform === 'win32') {
    const script = "Stop-ScheduledTask -TaskName 'Relay Privileged Helper' -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName 'Relay Privileged Helper' -Confirm:$false -ErrorAction SilentlyContinue"
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script])
  } else if (platform === 'darwin') {
    try { execFileSync('/bin/launchctl', ['bootout', 'system/app.relay.helper'], { stdio: 'ignore' }) } catch {}
    rmSync('/Library/LaunchDaemons/app.relay.helper.plist', { force: true })
  } else if (platform === 'linux') {
    try { execFileSync('systemctl', ['disable', '--now', 'relay-helper.service'], { stdio: 'ignore' }) } catch {}
    rmSync('/etc/systemd/system/relay-helper.service', { force: true })
    execFileSync('systemctl', ['daemon-reload'])
  } else {
    throw new Error('Relay Helper is unsupported on this platform')
  }
  rmSync(destination, { force: true })
  rmSync(binaries.helper, { force: true })
  rmSync(binaries.mihomo, { force: true })
  rmSync(systemRuntimeRoot(platform), { recursive: true, force: true })
  if (platform === 'linux') rmSync(binaries.root, { recursive: true, force: true })
}

function validateConfig(config: HelperConfig) {
  if (config.version !== 1 || config.token.length < 32) throw new Error('Invalid Relay Helper install configuration')
  if (!Number.isInteger(config.port) || config.port < 1024 || config.port > 65535) throw new Error('Invalid Relay Helper port')
  if (!/^[a-f0-9]{64}$/i.test(config.mihomoSha256)) throw new Error('Invalid Mihomo SHA-256 digest')
  for (const path of [config.allowedRoot, config.runtimeRoot, config.mihomoBinary, config.helperBinary]) {
    if (!path || !path.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(path)) throw new Error('Relay Helper install paths must be absolute')
  }
}

function installWindows(config: HelperConfig, destination: string) {
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', renderWindowsTask(config, destination)])
}

export function renderWindowsTask(config: HelperConfig, destination: string) {
  const execute = powershell(config.helperBinary)
  const argumentsValue = powershell(`--daemon --config "${destination}"`)
  return [
    `$action=New-ScheduledTaskAction -Execute ${execute} -Argument ${argumentsValue}`,
    "$principal=New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest",
    '$trigger=New-ScheduledTaskTrigger -AtStartup',
    '$settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries',
    "Register-ScheduledTask -TaskName 'Relay Privileged Helper' -Action $action -Principal $principal -Trigger $trigger -Settings $settings -Force | Out-Null",
    "Start-ScheduledTask -TaskName 'Relay Privileged Helper'",
  ].join('; ')
}

function installMac(config: HelperConfig, destination: string) {
  const path = '/Library/LaunchDaemons/app.relay.helper.plist'
  writeFileSync(path, renderMacPlist(config, destination), { mode: 0o644 })
  try { execFileSync('/bin/launchctl', ['bootout', 'system/app.relay.helper'], { stdio: 'ignore' }) } catch {}
  execFileSync('/bin/launchctl', ['bootstrap', 'system', path])
}

export function renderMacPlist(config: HelperConfig, destination: string) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0"><dict>',
    '<key>Label</key><string>app.relay.helper</string>',
    `<key>ProgramArguments</key><array><string>${xml(config.helperBinary)}</string><string>--daemon</string><string>--config</string><string>${xml(destination)}</string></array>`,
    '<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>',
    '</dict></plist>',
    '',
  ].join('\n')
}

function installLinux(config: HelperConfig, destination: string) {
  writeFileSync('/etc/systemd/system/relay-helper.service', renderSystemdUnit(config, destination), { mode: 0o644 })
  execFileSync('systemctl', ['daemon-reload'])
  execFileSync('systemctl', ['enable', '--now', 'relay-helper.service'])
}

export function renderSystemdUnit(config: HelperConfig, destination: string) {
  return [
    '[Unit]',
    'Description=Relay Privileged Helper',
    'After=network.target',
    '',
    '[Service]',
    'Type=simple',
    `ExecStart=${quoteSystemd(config.helperBinary)} --daemon --config ${quoteSystemd(destination)}`,
    'Restart=on-failure',
    'RestartSec=2',
    'NoNewPrivileges=true',
    'PrivateTmp=true',
    'ProtectSystem=strict',
    'ProtectHome=read-only',
    `ReadWritePaths=${quoteSystemd(config.runtimeRoot)}`,
    'CapabilityBoundingSet=CAP_NET_ADMIN CAP_NET_RAW CAP_NET_BIND_SERVICE',
    'AmbientCapabilities=CAP_NET_ADMIN CAP_NET_RAW CAP_NET_BIND_SERVICE',
    'RestrictSUIDSGID=true',
    'LockPersonality=true',
    '',
    '[Install]',
    'WantedBy=multi-user.target',
    '',
  ].join('\n')
}
