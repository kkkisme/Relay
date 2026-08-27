import { useState } from 'react'
import type { Profile } from '../../core'
import { useI18n } from '../../i18n'
import type { RelayAction } from '../../state/useRelay'
import { Badge, Button, Card, SectionHeader } from '../components'
import { colors, FONT } from '../theme'

export function Profiles({ profiles, busy, dispatch }: { profiles: Profile[]; busy: string | null; dispatch: (action: RelayAction) => void }) {
  const { locale, t } = useI18n()
  const [source, setSource] = useState<'remote' | 'local'>('remote')
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const canImport = name.trim().length > 0 && location.trim().length > 0 && busy === null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div>
        <SectionHeader title={t('profiles.title')} description={t('profiles.description')} action={<Badge>{t('profiles.managed')}</Badge>} />
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <text style={{ color: colors.text, fontFamily: FONT, fontSize: 14, fontWeight: 680 }}>{t('profiles.import.title')}</text>
              <text style={{ color: colors.textMuted, fontFamily: FONT, fontSize: 11 }}>{t('profiles.import.detail')}</text>
            </div>
            <div style={{ display: 'flex', flexDirection: 'row', gap: 9 }}>
              <SourceChoice active={source === 'remote'} label={t('profiles.import.remote')} onClick={() => setSource('remote')} />
              <SourceChoice active={source === 'local'} label={t('profiles.import.local')} onClick={() => setSource('local')} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'row', gap: 12, alignItems: 'flex-end' }}>
              <Field
                label={t('profiles.import.name')}
                value={name}
                placeholder={t('profiles.import.name.placeholder')}
                onChange={setName}
                width={230}
              />
              <Field
                label={t('profiles.import.location')}
                value={location}
                placeholder={t(source === 'remote' ? 'profiles.import.remote.placeholder' : 'profiles.import.local.placeholder')}
                onChange={setLocation}
              />
              <Button
                tone="primary"
                disabled={!canImport}
                onClick={() => dispatch({
                  type: 'import-profile',
                  name: name.trim(),
                  source,
                  location: location.trim(),
                })}
              >
                {t('profiles.import.action')}
              </Button>
            </div>
          </div>
        </Card>
      </div>

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
                <div style={{ display: 'flex', flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <text style={{ color: colors.textFaint, fontFamily: FONT, fontSize: 11 }}>{t('profiles.stats', { proxies: profile.proxies, rules: profile.rules.toLocaleString() })}</text>
                  <Badge>{t('profiles.revision', { revision: profile.revision })}</Badge>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                {profile.canRollback ? (
                  <Button disabled={busy !== null} onClick={() => dispatch({ type: 'rollback-profile', profileId: profile.id })}>
                    {t('profiles.rollback')}
                  </Button>
                ) : null}
                {profile.canUpdate ? (
                  <Button disabled={busy !== null} onClick={() => dispatch({ type: 'update-profile', profileId: profile.id })}>
                    {t('profiles.update')}
                  </Button>
                ) : null}
                <Button disabled={profile.active || busy !== null} tone={profile.active ? 'neutral' : 'primary'} onClick={() => dispatch({ type: 'activate-profile', profileId: profile.id })}>
                  {profile.active ? t('profiles.inUse') : t('profiles.activate')}
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

function SourceChoice({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        paddingTop: 8,
        paddingBottom: 8,
        paddingLeft: 12,
        paddingRight: 12,
        borderRadius: 8,
        cursor: 'pointer',
        backgroundColor: active ? colors.accentWash : colors.surfaceRaised,
        borderWidth: 1,
        borderColor: active ? colors.accent : colors.border,
      }}
    >
      <text style={{ color: active ? colors.accent : colors.textMuted, fontFamily: FONT, fontSize: 12, fontWeight: 650 }}>{label}</text>
    </div>
  )
}

function Field({
  label,
  value,
  placeholder,
  onChange,
  width,
}: {
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
  width?: number
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width, flexGrow: width ? 0 : 1 }}>
      <text style={{ color: colors.textMuted, fontFamily: FONT, fontSize: 11 }}>{label}</text>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.value ?? '')}
        style={{
          height: 37,
          paddingLeft: 11,
          paddingRight: 11,
          borderRadius: 8,
          backgroundColor: colors.surfaceRaised,
          borderWidth: 1,
          borderColor: colors.border,
          color: colors.text,
          fontFamily: FONT,
          fontSize: 12,
        }}
      />
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
