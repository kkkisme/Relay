import type { ProxyGroup } from '../../core'
import type { RelayAction } from '../../state/useRelay'
import { Badge, Button, Card, SectionHeader } from '../components'
import { colors, FONT } from '../theme'

export function Proxies({
  groups,
  busy,
  dispatch,
}: {
  groups: ProxyGroup[]
  busy: string | null
  dispatch: (action: RelayAction) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {groups.map((group) => (
        <div key={group.id}>
          <SectionHeader
            title={group.name}
            description={`${group.kind} · ${group.nodes.length} nodes`}
            action={<Button disabled={busy !== null} onClick={() => dispatch({ type: 'test-proxies', groupId: group.id })}>{busy === 'test-proxies' ? 'Testing…' : 'Test latency'}</Button>}
          />
          <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {group.nodes.map((node) => {
              const selected = group.selectedNodeId === node.id
              return (
                <div key={node.id} style={{ minWidth: 210, flexGrow: 1 }}>
                  <div
                    testId={`proxy-${group.id}-${node.id}`}
                    onClick={() => dispatch({ type: 'select-proxy', groupId: group.id, nodeId: node.id })}
                    style={{
                      cursor: 'pointer',
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: selected ? colors.accent : colors.border,
                      backgroundColor: selected ? colors.accentWash : colors.surface,
                      hover: { borderColor: colors.borderStrong, backgroundColor: colors.surfaceRaised },
                    }}
                  >
                    <Card>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                        <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <text style={{ color: colors.text, fontFamily: FONT, fontSize: 14, fontWeight: 680 }}>{node.name}</text>
                          {selected ? <Badge tone="accent">Active</Badge> : null}
                        </div>
                        <text style={{ color: colors.textMuted, fontFamily: FONT, fontSize: 11 }}>{node.location} · {node.type.toUpperCase()}</text>
                        <text style={{ color: node.latency && node.latency < 100 ? colors.success : colors.warning, fontFamily: FONT, fontSize: 17, fontWeight: 700 }}>
                          {node.latency ? `${node.latency} ms` : 'Not tested'}
                        </text>
                      </div>
                    </Card>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
