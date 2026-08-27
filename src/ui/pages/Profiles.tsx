import type { Profile } from '../../core'
import type { RelayAction } from '../../state/useRelay'
import { Badge, Button, Card, SectionHeader } from '../components'
import { colors, FONT } from '../theme'

export function Profiles({ profiles, busy, dispatch }: { profiles: Profile[]; busy: string | null; dispatch: (action: RelayAction) => void }) {
  return (
    <div>
      <SectionHeader title="Configuration profiles" description="Subscription and local Mihomo configurations" action={<Button tone="primary" onClick={() => {}}>Add profile</Button>} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {profiles.map((profile) => (
          <Card key={profile.id}>
            <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', flexDirection: 'row', gap: 9, alignItems: 'center' }}>
                  <text style={{ color: colors.text, fontFamily: FONT, fontSize: 16, fontWeight: 700 }}>{profile.name}</text>
                  {profile.active ? <Badge tone="success">Active</Badge> : null}
                </div>
                <text style={{ color: colors.textMuted, fontFamily: FONT, fontSize: 12 }}>{profile.source} · Updated {profile.updatedAt}</text>
                <text style={{ color: colors.textFaint, fontFamily: FONT, fontSize: 11 }}>{profile.proxies} proxies · {profile.rules.toLocaleString()} rules</text>
              </div>
              <Button disabled={profile.active || busy !== null} tone={profile.active ? 'neutral' : 'primary'} onClick={() => dispatch({ type: 'activate-profile', profileId: profile.id })}>
                {profile.active ? 'In use' : 'Activate'}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
