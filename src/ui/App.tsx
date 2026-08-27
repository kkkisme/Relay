import { useState } from 'react'
import { I18nProvider, useI18n } from '../i18n'
import { useRelay } from '../state/useRelay'
import { Badge, Button } from './components'
import { Dashboard } from './pages/Dashboard'
import { Proxies } from './pages/Proxies'
import { Profiles } from './pages/Profiles'
import { Connections } from './pages/Connections'
import { Logs } from './pages/Logs'
import { Settings } from './pages/Settings'
import { colors, FONT } from './theme'

const pages = {
  dashboard: { label: 'nav.dashboard', description: 'nav.dashboard.description' },
  proxies: { label: 'nav.proxies', description: 'nav.proxies.description' },
  profiles: { label: 'nav.profiles', description: 'nav.profiles.description' },
  connections: { label: 'nav.connections', description: 'nav.connections.description' },
  logs: { label: 'nav.logs', description: 'nav.logs.description' },
  settings: { label: 'nav.settings', description: 'nav.settings.description' },
} as const

type PageId = keyof typeof pages

export function App() {
  return (
    <I18nProvider>
      <RelayApp />
    </I18nProvider>
  )
}

function RelayApp() {
  const [page, setPage] = useState<PageId>('dashboard')
  const { snapshot, loading, busy, error, dispatch } = useRelay()
  const { t } = useI18n()
  const pageInfo = pages[page]

  return (
    <div style={{ display: 'flex', flexDirection: 'row', height: '100%', backgroundColor: colors.app }}>
      <div
        style={{
          width: 228,
          paddingTop: 54,
          paddingBottom: 18,
          paddingLeft: 14,
          paddingRight: 14,
          backgroundColor: colors.sidebar,
          borderRightWidth: 1,
          borderColor: colors.border,
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 11, paddingLeft: 8, marginBottom: 28 }}>
            <img src="assets/icon.png" alt="Relay" objectFit="cover" style={{ width: 34, height: 34, borderRadius: 9 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <text style={{ color: colors.text, fontFamily: FONT, fontSize: 19, fontWeight: 760 }}>Relay</text>
              <text style={{ color: colors.textFaint, fontFamily: FONT, fontSize: 9 }}>{t('app.tagline')}</text>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {(Object.keys(pages) as PageId[]).map((item) => {
              const active = item === page
              return (
                <div
                  key={item}
                  testId={`nav-${item}`}
                  onClick={() => setPage(item)}
                  style={{
                    paddingTop: 10,
                    paddingBottom: 10,
                    paddingLeft: 12,
                    paddingRight: 12,
                    borderRadius: 9,
                    cursor: 'pointer',
                    backgroundColor: active ? colors.accentWash : 'transparent',
                    borderWidth: 1,
                    borderColor: active ? '#1c5557' : 'transparent',
                    hover: { backgroundColor: active ? colors.accentWash : colors.surfaceRaised },
                  }}
                >
                  <text style={{ color: active ? colors.accent : colors.textMuted, fontFamily: FONT, fontSize: 13, fontWeight: active ? 680 : 520 }}>
                    {t(pages[item].label)}
                  </text>
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ padding: 12, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 7 }}>
          <div style={{ display: 'flex', flexDirection: 'row', gap: 7, alignItems: 'center' }}>
            <div style={{ width: 7, height: 7, borderRadius: 99, backgroundColor: snapshot?.status.running ? colors.success : colors.danger }} />
            <text style={{ color: colors.text, fontFamily: FONT, fontSize: 11, fontWeight: 650 }}>
              {snapshot?.status.running ? t('core.connected') : t('core.stopped')}
            </text>
          </div>
          <text style={{ color: colors.textFaint, fontFamily: FONT, fontSize: 9 }}>{snapshot?.status.version ?? t('core.connecting')}</text>
        </div>
      </div>

      <div style={{ flexGrow: 1, minWidth: 0 }}>
        <div
          style={{
            height: 80,
            paddingTop: 20,
            paddingBottom: 16,
            paddingLeft: 28,
            paddingRight: 28,
            borderBottomWidth: 1,
            borderColor: colors.border,
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <text style={{ color: colors.text, fontFamily: FONT, fontSize: 22, fontWeight: 740 }}>{t(pageInfo.label)}</text>
            <text style={{ color: colors.textMuted, fontFamily: FONT, fontSize: 11 }}>{t(pageInfo.description)}</text>
          </div>
          <div style={{ display: 'flex', flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            {busy ? <Badge tone="accent">{t('core.applying')}</Badge> : null}
            {snapshot ? (
              <Button
                tone={snapshot.status.running ? 'danger' : 'primary'}
                disabled={busy !== null}
                onClick={() => dispatch({ type: 'set-running', running: !snapshot.status.running })}
              >
                {snapshot.status.running ? t('core.stop') : t('core.start')}
              </Button>
            ) : null}
          </div>
        </div>

        <div style={{ height: '100%', overflowY: 'scroll', padding: 28 }}>
          {error ? (
            <div style={{ padding: 12, marginBottom: 16, borderRadius: 10, backgroundColor: '#351b25', borderWidth: 1, borderColor: '#633044' }}>
              <text style={{ color: colors.danger, fontFamily: FONT, fontSize: 12 }}>{error}</text>
            </div>
          ) : null}
          {loading || !snapshot ? (
            <div style={{ paddingTop: 80, alignItems: 'center', gap: 8 }}>
              <text style={{ color: colors.text, fontFamily: FONT, fontSize: 16, fontWeight: 680 }}>{t('core.connecting.title')}</text>
              <text style={{ color: colors.textMuted, fontFamily: FONT, fontSize: 12 }}>{t('core.connecting.detail')}</text>
            </div>
          ) : (
            <PageContent page={page} snapshot={snapshot} busy={busy} dispatch={dispatch} />
          )}
        </div>
      </div>
    </div>
  )
}

function PageContent({
  page,
  snapshot,
  busy,
  dispatch,
}: {
  page: PageId
  snapshot: NonNullable<ReturnType<typeof useRelay>['snapshot']>
  busy: string | null
  dispatch: ReturnType<typeof useRelay>['dispatch']
}) {
  switch (page) {
    case 'dashboard':
      return <Dashboard snapshot={snapshot} dispatch={dispatch} />
    case 'proxies':
      return <Proxies groups={snapshot.proxyGroups} busy={busy} dispatch={dispatch} />
    case 'profiles':
      return <Profiles profiles={snapshot.profiles} busy={busy} dispatch={dispatch} />
    case 'connections':
      return <Connections connections={snapshot.connections} dispatch={dispatch} />
    case 'logs':
      return <Logs logs={snapshot.logs} dispatch={dispatch} />
    case 'settings':
      return <Settings settings={snapshot.settings} desktop={snapshot.desktop} busy={busy} dispatch={dispatch} />
  }
}
