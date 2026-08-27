import type { Connection } from '../../core'
import type { RelayAction } from '../../state/useRelay'
import { Button, Card, EmptyState, SectionHeader } from '../components'
import { colors, FONT } from '../theme'

export function Connections({ connections, dispatch }: { connections: Connection[]; dispatch: (action: RelayAction) => void }) {
  return (
    <div>
      <SectionHeader
        title="Active connections"
        description={`${connections.length} sessions currently tracked`}
        action={<Button tone="danger" disabled={connections.length === 0} onClick={() => dispatch({ type: 'close-all-connections' })}>Close all</Button>}
      />
      {connections.length === 0 ? (
        <EmptyState title="No active connections" detail="New network sessions will appear here." />
      ) : (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Row muted values={['Host / process', 'Traffic', 'Rule / chain', 'Duration', '']} />
            {connections.map((connection) => (
              <div key={connection.id} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', paddingTop: 11, paddingBottom: 11, borderTopWidth: 1, borderColor: colors.border }}>
                <div style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <text style={{ color: colors.text, fontFamily: FONT, fontSize: 12 }}>{connection.host}</text>
                  <text style={{ color: colors.textFaint, fontFamily: FONT, fontSize: 10 }}>{connection.process}</text>
                </div>
                <text style={{ color: colors.textMuted, fontFamily: FONT, fontSize: 11, width: 130 }}>↑ {connection.upload} KB  ↓ {connection.download} KB</text>
                <div style={{ width: 190, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <text style={{ color: colors.accent, fontFamily: FONT, fontSize: 11 }}>{connection.rule}</text>
                  <text style={{ color: colors.textFaint, fontFamily: FONT, fontSize: 10 }}>{connection.chain}</text>
                </div>
                <text style={{ color: colors.textMuted, fontFamily: FONT, fontSize: 11, width: 70 }}>{connection.duration}</text>
                <Button tone="danger" onClick={() => dispatch({ type: 'close-connection', connectionId: connection.id })}>Close</Button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

function Row({ values, muted }: { values: string[]; muted?: boolean }) {
  const widths = [260, 130, 190, 70, 60]
  return (
    <div style={{ display: 'flex', flexDirection: 'row', paddingBottom: 8 }}>
      {values.map((value, index) => (
        <text key={value || String(index)} style={{ color: muted ? colors.textFaint : colors.text, fontFamily: FONT, fontSize: 10, fontWeight: 650, width: widths[index] }}>{value}</text>
      ))}
    </div>
  )
}
