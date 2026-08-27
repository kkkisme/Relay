import type { LogEntry } from '../../core'
import { useI18n } from '../../i18n'
import type { RelayAction } from '../../state/useRelay'
import { Badge, Button, Card, EmptyState, SectionHeader } from '../components'
import { colors, FONT, MONO } from '../theme'

export function Logs({ logs, dispatch }: { logs: LogEntry[]; dispatch: (action: RelayAction) => void }) {
  const { t } = useI18n()
  return (
    <div>
      <SectionHeader title={t('logs.title')} description={t('logs.description')} action={<Button disabled={logs.length === 0} onClick={() => dispatch({ type: 'clear-logs' })}>{t('logs.clear')}</Button>} />
      {logs.length === 0 ? (
        <EmptyState title={t('logs.empty')} detail={t('logs.empty.detail')} />
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
