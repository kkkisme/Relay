import type { RelaySettings } from '../../core'
import { useI18n } from '../../i18n'
import type { RelayAction } from '../../state/useRelay'
import { Card, SectionHeader, Toggle } from '../components'
import { colors, FONT } from '../theme'

const modeLabels = {
  rule: 'settings.mode.rule',
  global: 'settings.mode.global',
  direct: 'settings.mode.direct',
} as const

export function Settings({ settings, dispatch }: { settings: RelaySettings; dispatch: (action: RelayAction) => void }) {
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
            <SettingRow title={t('settings.systemProxy')} detail={t('settings.systemProxy.detail')} value={settings.systemProxy} onChange={(systemProxy) => update({ systemProxy })} />
            <SettingRow title={t('settings.tun')} detail={t('settings.tun.detail')} value={settings.tun} onChange={(tun) => update({ tun })} />
            <SettingRow title={t('settings.allowLan')} detail={t('settings.allowLan.detail')} value={settings.allowLan} onChange={(allowLan) => update({ allowLan })} />
            <SettingRow title={t('settings.ipv6')} detail={t('settings.ipv6.detail')} value={settings.ipv6} onChange={(ipv6) => update({ ipv6 })} />
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

function SettingRow({ title, detail, value, onChange }: { title: string; detail: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <text style={{ color: colors.text, fontFamily: FONT, fontSize: 13, fontWeight: 650 }}>{title}</text>
        <text style={{ color: colors.textMuted, fontFamily: FONT, fontSize: 11 }}>{detail}</text>
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  )
}
