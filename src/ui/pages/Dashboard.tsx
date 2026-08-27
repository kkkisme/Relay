import type { RelaySnapshot } from '../../core'
import { useI18n } from '../../i18n'
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
  const { t } = useI18n()
  const selected = snapshot.proxyGroups[0]?.nodes.find(
    (node) => node.id === snapshot.proxyGroups[0]?.selectedNodeId,
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        <MetricCard label={t('dashboard.download')} value={speed(snapshot.metrics.downloadSpeed)} detail={t('dashboard.total', { value: snapshot.metrics.downloadTotal })} accent={colors.accentBlue} />
        <MetricCard label={t('dashboard.upload')} value={speed(snapshot.metrics.uploadSpeed)} detail={t('dashboard.total', { value: snapshot.metrics.uploadTotal })} />
        <MetricCard label={t('dashboard.connections')} value={String(snapshot.metrics.connections)} detail={t('dashboard.activeSessions')} accent={colors.warning} />
        <MetricCard label={t('dashboard.memory')} value={`${snapshot.metrics.memory} MB`} detail={t('dashboard.coreFootprint')} accent={colors.success} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'row', gap: 16 }}>
        <div style={{ flexGrow: 2 }}>
          <SectionHeader title={t('dashboard.currentRoute')} description={t('dashboard.currentRoute.detail')} />
          <Card>
            <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <text style={{ color: colors.text, fontFamily: FONT, fontSize: 20, fontWeight: 720 }}>
                    {selected?.name ?? t('dashboard.noProxy')}
                  </text>
                  <Badge tone="success">{selected?.latency ? `${selected.latency} ms` : t('dashboard.pending')}</Badge>
                </div>
                <text style={{ color: colors.textMuted, fontFamily: FONT, fontSize: 12 }}>
                  {selected ? `${selected.location} · ${selected.type.toUpperCase()}` : t('dashboard.selectHint')}
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
          <SectionHeader title={t('dashboard.quickControls')} description={t('dashboard.runtimeSwitches')} />
          <Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <QuickToggle label={t('dashboard.systemProxy')} value={snapshot.settings.systemProxy} disabled={!snapshot.desktop.systemProxy.supported} onChange={(systemProxy) => dispatch({ type: 'update-settings', settings: { systemProxy } })} />
              <QuickToggle label={t('dashboard.tun')} value={snapshot.settings.tun} disabled={!snapshot.settings.tun && snapshot.desktop.tun.permission !== 'granted'} onChange={(tun) => dispatch({ type: 'update-settings', settings: { tun } })} />
              <QuickToggle label={t('dashboard.allowLan')} value={snapshot.settings.allowLan} onChange={(allowLan) => dispatch({ type: 'update-settings', settings: { allowLan } })} />
            </div>
          </Card>
        </div>
      </div>

      <SectionHeader title={t('dashboard.recentActivity')} description={t('dashboard.recentActivity.detail')} />
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

function QuickToggle({ label, value, onChange, disabled = false }: { label: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <text style={{ color: colors.text, fontFamily: FONT, fontSize: 13 }}>{label}</text>
      <Toggle value={value} onChange={onChange} disabled={disabled} />
    </div>
  )
}
