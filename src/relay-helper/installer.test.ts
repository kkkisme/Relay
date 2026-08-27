import { describe, expect, test } from 'bun:test'
import type { HelperConfig } from './protocol'
import { renderMacPlist, renderSystemdUnit, renderWindowsTask } from './installer'

const config: HelperConfig = {
  version: 1,
  token: 'a'.repeat(64),
  port: 51938,
  allowedRoot: '/Users/relay/Application Support/Relay',
  runtimeRoot: '/Library/Application Support/Relay/runtime',
  mihomoBinary: '/Library/PrivilegedHelperTools/app.relay.mihomo',
  mihomoSha256: 'b'.repeat(64),
  helperBinary: '/Library/PrivilegedHelperTools/app.relay.helper',
}

describe('Relay Helper service definitions', () => {
  test('renders a SYSTEM startup task on Windows', () => {
    const script = renderWindowsTask({
      ...config,
      helperBinary: "C:\\Program Files\\Relay\\relay-helper.exe",
    }, 'C:\\ProgramData\\Relay\\helper.json')
    expect(script).toContain("-UserId 'SYSTEM'")
    expect(script).toContain('New-ScheduledTaskTrigger -AtStartup')
    expect(script).toContain('C:\\Program Files\\Relay\\relay-helper.exe')
  })

  test('escapes paths in a root macOS LaunchDaemon', () => {
    const plist = renderMacPlist({ ...config, helperBinary: '/Library/Relay & Helper' }, '/Library/Relay & Config')
    expect(plist).toContain('<key>Label</key><string>app.relay.helper</string>')
    expect(plist).toContain('/Library/Relay &amp; Helper')
    expect(plist).toContain('<key>KeepAlive</key><true/>')
  })

  test('hardens the Linux systemd unit', () => {
    const unit = renderSystemdUnit(config, '/etc/relay/helper.json')
    expect(unit).toContain('ExecStart="/Library/PrivilegedHelperTools/app.relay.helper"')
    expect(unit).toContain('NoNewPrivileges=true')
    expect(unit).toContain('CapabilityBoundingSet=CAP_NET_ADMIN CAP_NET_RAW CAP_NET_BIND_SERVICE')
    expect(unit).toContain('ProtectSystem=strict')
    expect(unit).toContain('Restart=on-failure')
  })
})
