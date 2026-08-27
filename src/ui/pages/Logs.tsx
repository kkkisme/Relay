import type { LogEntry } from '../../core'
import type { RelayAction } from '../../state/useRelay'
import { Badge, Button, Card, EmptyState, SectionHeader } from '../components'
import { colors, FONT, MONO } from '../theme'

export function Logs({ logs, dispatch }: { logs: LogEntry[]; dispatch: (action: RelayAction) => void }) {
  return (
    <div>
      <SectionHeader title="Core logs" description="Runtime events from the Mihomo boundary" action={<Button disabled={logs.length === 0} onClick={() => dispatch({ type: 'clear-logs' })}>Clear</Button>} />
      {logs.length === 0 ? (
        <EmptyState title="Logs cleared" detail="New runtime events will appear here." />
      ) : (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {logs.slice().reverse().map((entry) => (
              <div key={entry.id} style={{ display: 'flex', flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <text style={{ color: colors.textFaint, fontFamily: MONO, fontSize: 11, width: 72 }}>{entry.time}</text>
                <div style={{ width: 68 }}><Badge tone={entry.level === 'error' ? 'danger' : entry.level === 'warning' ? 'warning' : entry.level === 'info' ? 'success' : 'neutral'}>{entry.level}</Badge></div>
                <text style={{ color: colors.textMuted, fontFamily: MONO, fontSize: 11 }}>{entry.message}</text>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
