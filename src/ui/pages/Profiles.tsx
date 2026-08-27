import type { Profile } from '../../core'
import { useI18n } from '../../i18n'
import type { RelayAction } from '../../state/useRelay'
import { Badge, Button, Card, SectionHeader } from '../components'
import { colors, FONT } from '../theme'

export function Profiles({ profiles, busy, dispatch }: { profiles: Profile[]; busy: string | null; dispatch: (action: RelayAction) => void }) {
  const { locale, t } = useI18n()
  return (
    <div>
      <SectionHeader title={t('profiles.title')} description={t('profiles.description')} action={<Badge>{t('profiles.phase3')}</Badge>} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {profiles.map((profile) => (
          <Card key={profile.id}>
            <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', flexDirection: 'row', gap: 9, alignItems: 'center' }}>
                  <text style={{ color: colors.text, fontFamily: FONT, fontSize: 16, fontWeight: 700 }}>{profile.name}</text>
                  {profile.active ? <Badge tone="success">{t('profiles.active')}</Badge> : null}
                </div>
                <text style={{ color: colors.textMuted, fontFamily: FONT, fontSize: 12 }}>
                  {t('profiles.updated', {
                    source: t(profile.source === 'remote' ? 'profiles.source.remote' : 'profiles.source.local'),
                    time: formatRelativeTime(profile.updatedAt, locale),
                  })}
                </text>
                <text style={{ color: colors.textFaint, fontFamily: FONT, fontSize: 11 }}>{t('profiles.stats', { proxies: profile.proxies, rules: profile.rules.toLocaleString() })}</text>
              </div>
              <Button disabled={profile.active || busy !== null} tone={profile.active ? 'neutral' : 'primary'} onClick={() => dispatch({ type: 'activate-profile', profileId: profile.id })}>
                {profile.active ? t('profiles.inUse') : t('profiles.activate')}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

function formatRelativeTime(value: string, locale: 'zh-CN' | 'en') {
  const minutes = Math.round((new Date(value).getTime() - Date.now()) / 60_000)
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour')
  return formatter.format(Math.round(hours / 24), 'day')
}
