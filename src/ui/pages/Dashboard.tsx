import type { RelaySnapshot } from '../../core'
import type { RelayAction } from '../../state/useRelay'
import { Badge, Card, MetricCard, SectionHeader, Toggle } from '../components'
import { colors, FONT } from '../theme'

const speed = (value: number) => (value >= 1024 ? `${(value / 1024).toFixed(1)} MB/s` : `${value} KB/s`)

export function Dashboard({
  snapshot,
  dispatch,
}: {
  snapshot: RelaySnapshot
  dispatch: (action: RelayAction) => void
}) {
  const selected = snapshot.proxyGroups[0]?.nodes.find(
    (node) => node.id === snapshot.proxyGroups[0]?.selectedNodeId,
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        <MetricCard label="Download" value={speed(snapshot.metrics.downloadSpeed)} detail={`${snapshot.metrics.downloadTotal} GB total`} accent={colors.accentBlue} />
        <MetricCard label="Upload" value={speed(snapshot.metrics.uploadSpeed)} detail={`${snapshot.metrics.uploadTotal} GB total`} />
        <MetricCard label="Connections" value={String(snapshot.metrics.connections)} detail="Active sessions" accent={colors.warning} />
        <MetricCard label="Memory" value={`${snapshot.metrics.memory} MB`} detail="Core footprint" accent={colors.success} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'row', gap: 16 }}>
        <div style={{ flexGrow: 2 }}>
          <SectionHeader title="Current route" description="The active outbound for the main proxy group" />
          <Card>
            <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <text style={{ color: colors.text, fontFamily: FONT, fontSize: 20, fontWeight: 720 }}>
                    {selected?.name ?? 'No proxy selected'}
                  </text>
                  <Badge tone="success">{selected?.latency ? `${selected.latency} ms` : 'Pending'}</Badge>
                </div>
                <text style={{ color: colors.textMuted, fontFamily: FONT, fontSize: 12 }}>
                  {selected ? `${selected.location} · ${selected.type.toUpperCase()}` : 'Open Proxies to select a node'}
                </text>
              </div>
              <div style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: colors.accentWash, alignItems: 'center', justifyContent: 'center' }}>
                <text style={{ color: colors.accent, fontFamily: FONT, fontSize: 18, fontWeight: 800 }}>
                  {selected?.location ?? '--'}
                </text>
              </div>
            </div>
          </Card>
        </div>

        <div style={{ flexGrow: 1 }}>
          <SectionHeader title="Quick controls" description="Runtime switches" />
          <Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <QuickToggle label="System proxy" value={snapshot.settings.systemProxy} onChange={(systemProxy) => dispatch({ type: 'update-settings', settings: { systemProxy } })} />
              <QuickToggle label="TUN mode" value={snapshot.settings.tun} onChange={(tun) => dispatch({ type: 'update-settings', settings: { tun } })} />
              <QuickToggle label="Allow LAN" value={snapshot.settings.allowLan} onChange={(allowLan) => dispatch({ type: 'update-settings', settings: { allowLan } })} />
            </div>
          </Card>
        </div>
      </div>

      <SectionHeader title="Recent activity" description="Latest events from Relay Core" />
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          {snapshot.logs.slice(-4).reverse().map((entry) => (
            <div key={entry.id} style={{ display: 'flex', flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <text style={{ color: colors.textFaint, fontFamily: FONT, fontSize: 11, width: 64 }}>{entry.time}</text>
              <Badge tone={entry.level === 'warning' ? 'warning' : entry.level === 'error' ? 'danger' : 'neutral'}>{entry.level}</Badge>
              <text style={{ color: colors.textMuted, fontFamily: FONT, fontSize: 12 }}>{entry.message}</text>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function QuickToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <text style={{ color: colors.text, fontFamily: FONT, fontSize: 13 }}>{label}</text>
      <Toggle value={value} onChange={onChange} />
    </div>
  )
}
