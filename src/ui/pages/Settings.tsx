import type { DesktopStatus, RelaySettings } from '../../core'
import { useI18n } from '../../i18n'
import type { RelayAction } from '../../state/useRelay'
import { Button, Card, SectionHeader, Toggle } from '../components'
import { colors, FONT } from '../theme'

const modeLabels = {
  rule: 'settings.mode.rule',
  global: 'settings.mode.global',
  direct: 'settings.mode.direct',
} as const

export function Settings({ settings, desktop, busy, dispatch }: { settings: RelaySettings; desktop: DesktopStatus; busy: string | null; dispatch: (action: RelayAction) => void }) {
  const { locale, setLocale, t } = useI18n()
  const update = (next: Partial<RelaySettings>) => dispatch({ type: 'update-settings', settings: next })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div>
        <SectionHeader title={t('settings.proxyMode')} description={t('settings.proxyMode.detail')} />
        <Card>
          <div style={{ display: 'flex', flexDirection: 'row', gap: 10 }}>
            {(['rule', 'global', 'direct'] as const).map((mode) => (
              <div
                key={mode}
                testId={`mode-${mode}`}
                onClick={() => update({ mode })}
                style={{
                  flexGrow: 1,
                  padding: 14,
                  borderRadius: 10,
                  cursor: 'pointer',
                  backgroundColor: settings.mode === mode ? colors.accentWash : colors.surfaceRaised,
                  borderWidth: 1,
                  borderColor: settings.mode === mode ? colors.accent : colors.border,
                  hover: { borderColor: colors.borderStrong },
                }}
              >
                <text style={{ color: settings.mode === mode ? colors.accent : colors.text, fontFamily: FONT, fontSize: 13, fontWeight: 680 }}>
                  {t(modeLabels[mode])}
                </text>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div>
        <SectionHeader title={t('settings.network')} description={t('settings.network.detail')} />
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <SettingRow
              title={t('settings.systemProxy')}
              detail={desktop.systemProxy.error ?? (desktop.systemProxy.managed ? t('settings.systemProxy.managed') : t('settings.systemProxy.detail'))}
              value={settings.systemProxy}
              disabled={!desktop.systemProxy.supported}
              onChange={(systemProxy) => update({ systemProxy })}
            />
            <SettingRow
              title={t('settings.tun')}
              detail={t(`settings.tun.permission.${desktop.tun.permission}`)}
              value={settings.tun}
              disabled={!settings.tun && desktop.tun.permission !== 'granted'}
              onChange={(tun) => update({ tun })}
            />
            <HelperRow
              state={desktop.tun.helper}
              detail={desktop.tun.detail}
              disabled={busy !== null || settings.tun || !desktop.tun.installSupported}
              onInstall={() => dispatch({ type: 'install-tun-helper' })}
              onUninstall={() => dispatch({ type: 'uninstall-tun-helper' })}
            />
            <SettingRow title={t('settings.allowLan')} detail={t('settings.allowLan.detail')} value={settings.allowLan} onChange={(allowLan) => update({ allowLan })} />
            <SettingRow title={t('settings.ipv6')} detail={t('settings.ipv6.detail')} value={settings.ipv6} onChange={(ipv6) => update({ ipv6 })} />
          </div>
        </Card>
      </div>

      <div>
        <SectionHeader title={t('settings.desktop')} description={t('settings.desktop.detail')} />
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <SettingRow
              title={t('settings.launchAtLogin')}
              detail={desktop.launchAtLogin.supported ? t('settings.launchAtLogin.detail') : t('settings.feature.unavailable')}
              value={settings.launchAtLogin}
              disabled={!desktop.launchAtLogin.supported}
              onChange={(launchAtLogin) => update({ launchAtLogin })}
            />
            <StatusRow
              title={t('settings.tray')}
              detail={t('settings.tray.pending')}
              available={desktop.tray.supported}
              availableLabel={t('settings.feature.available')}
              unavailableLabel={t('settings.feature.pending')}
            />
          </div>
        </Card>
      </div>

      <div>
        <SectionHeader title={t('settings.language')} description={t('settings.language.detail')} />
        <Card>
          <div style={{ display: 'flex', flexDirection: 'row', gap: 10 }}>
            {([
              { id: 'zh-CN', label: 'settings.language.zhCN' },
              { id: 'en', label: 'settings.language.en' },
            ] as const).map((item) => {
              const active = locale === item.id
              return (
                <div
                  key={item.id}
                  testId={`language-${item.id}`}
                  onClick={() => setLocale(item.id)}
                  style={{
                    flexGrow: 1,
                    padding: 14,
                    borderRadius: 10,
                    cursor: 'pointer',
                    backgroundColor: active ? colors.accentWash : colors.surfaceRaised,
                    borderWidth: 1,
                    borderColor: active ? colors.accent : colors.border,
                    hover: { borderColor: colors.borderStrong },
                  }}
                >
                  <text style={{ color: active ? colors.accent : colors.text, fontFamily: FONT, fontSize: 13, fontWeight: 680 }}>
                    {t(item.label)}
                  </text>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      <div>
        <SectionHeader title={t('settings.about')} />
        <Card>
          <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between' }}>
            <text style={{ color: colors.text, fontFamily: FONT, fontSize: 13 }}>Relay 0.1.0</text>
            <text style={{ color: colors.textMuted, fontFamily: FONT, fontSize: 12 }}>{t('settings.stack')}</text>
          </div>
        </Card>
      </div>
    </div>
  )
}

function HelperRow({ state, detail, disabled, onInstall, onUninstall }: {
  state: DesktopStatus['tun']['helper']
  detail: string
  disabled: boolean
  onInstall: () => void
  onUninstall: () => void
}) {
  const { t } = useI18n()
  return (
    <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <text style={{ color: colors.text, fontFamily: FONT, fontSize: 13, fontWeight: 650 }}>{t('settings.tun.helper')}</text>
        <text style={{ color: colors.textMuted, fontFamily: FONT, fontSize: 11 }}>
          {state === 'ready' ? t('settings.tun.helper.ready') : state === 'not-installed' ? t('settings.tun.helper.missing') : detail}
        </text>
      </div>
      <Button
        tone={state === 'ready' ? 'danger' : 'primary'}
        disabled={disabled}
        onClick={state === 'ready' ? onUninstall : onInstall}
      >
        {state === 'ready'
          ? t('settings.tun.helper.uninstall')
          : state === 'unavailable'
            ? t('settings.tun.helper.repair')
            : t('settings.tun.helper.install')}
      </Button>
    </div>
  )
}

function SettingRow({ title, detail, value, onChange, disabled = false }: { title: string; detail: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <text style={{ color: colors.text, fontFamily: FONT, fontSize: 13, fontWeight: 650 }}>{title}</text>
        <text style={{ color: colors.textMuted, fontFamily: FONT, fontSize: 11 }}>{detail}</text>
      </div>
      <Toggle value={value} onChange={onChange} disabled={disabled} />
    </div>
  )
}

function StatusRow({ title, detail, available, availableLabel, unavailableLabel }: { title: string; detail: string; available: boolean; availableLabel: string; unavailableLabel: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <text style={{ color: colors.text, fontFamily: FONT, fontSize: 13, fontWeight: 650 }}>{title}</text>
        <text style={{ color: colors.textMuted, fontFamily: FONT, fontSize: 11 }}>{detail}</text>
      </div>
      <text style={{ color: available ? colors.success : colors.warning, fontFamily: FONT, fontSize: 11, fontWeight: 650 }}>
        {available ? availableLabel : unavailableLabel}
      </text>
    </div>
  )
}
