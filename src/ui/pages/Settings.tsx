import type { RelaySettings } from '../../core'
import type { RelayAction } from '../../state/useRelay'
import { Card, SectionHeader, Toggle } from '../components'
import { colors, FONT } from '../theme'

export function Settings({ settings, dispatch }: { settings: RelaySettings; dispatch: (action: RelayAction) => void }) {
  const update = (next: Partial<RelaySettings>) => dispatch({ type: 'update-settings', settings: next })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div>
        <SectionHeader title="Proxy mode" description="Choose how Mihomo evaluates traffic" />
        <Card>
          <div style={{ display: 'flex', flexDirection: 'row', gap: 10 }}>
            {(['rule', 'global', 'direct'] as const).map((mode) => (
              <div
                key={mode}
                testId={`mode-${mode}`}
                onClick={() => update({ mode })}
                style={{
                  flexGrow: 1,
                  padding: 14,
                  borderRadius: 10,
                  cursor: 'pointer',
                  backgroundColor: settings.mode === mode ? colors.accentWash : colors.surfaceRaised,
                  borderWidth: 1,
                  borderColor: settings.mode === mode ? colors.accent : colors.border,
                  hover: { borderColor: colors.borderStrong },
                }}
              >
                <text style={{ color: settings.mode === mode ? colors.accent : colors.text, fontFamily: FONT, fontSize: 13, fontWeight: 680 }}>
                  {mode[0].toUpperCase() + mode.slice(1)}
                </text>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div>
        <SectionHeader title="Network" description="Runtime networking features" />
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <SettingRow title="System proxy" detail="Route supported application traffic through Relay" value={settings.systemProxy} onChange={(systemProxy) => update({ systemProxy })} />
            <SettingRow title="TUN mode" detail="Capture traffic at the network interface level" value={settings.tun} onChange={(tun) => update({ tun })} />
            <SettingRow title="Allow LAN" detail="Accept proxy connections from devices on the local network" value={settings.allowLan} onChange={(allowLan) => update({ allowLan })} />
            <SettingRow title="IPv6" detail="Enable IPv6 resolution and outbound connections" value={settings.ipv6} onChange={(ipv6) => update({ ipv6 })} />
          </div>
        </Card>
      </div>

      <div>
        <SectionHeader title="About" />
        <Card>
          <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between' }}>
            <text style={{ color: colors.text, fontFamily: FONT, fontSize: 13 }}>Relay 0.1.0</text>
            <text style={{ color: colors.textMuted, fontFamily: FONT, fontSize: 12 }}>GPUIX · React 19 · Mihomo</text>
          </div>
        </Card>
      </div>
    </div>
  )
}

function SettingRow({ title, detail, value, onChange }: { title: string; detail: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <text style={{ color: colors.text, fontFamily: FONT, fontSize: 13, fontWeight: 650 }}>{title}</text>
        <text style={{ color: colors.textMuted, fontFamily: FONT, fontSize: 11 }}>{detail}</text>
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  )
}
