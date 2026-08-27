import type { ReactNode } from 'react'
import { colors, FONT } from './theme'

type ButtonProps = {
  children: ReactNode
  onClick: () => void
  tone?: 'primary' | 'neutral' | 'danger'
  disabled?: boolean
  testId?: string
}

export function Button({ children, onClick, tone = 'neutral', disabled = false, testId }: ButtonProps) {
  const backgroundColor =
    tone === 'primary' ? colors.accent : tone === 'danger' ? '#3b1d2a' : colors.surfaceRaised
  const textColor = tone === 'primary' ? '#062521' : tone === 'danger' ? colors.danger : colors.text

  return (
    <div
      testId={testId}
      onClick={() => !disabled && onClick()}
      style={{
        paddingTop: 9,
        paddingBottom: 9,
        paddingLeft: 14,
        paddingRight: 14,
        borderRadius: 9,
        cursor: disabled ? 'default' : 'pointer',
        backgroundColor,
        borderWidth: tone === 'neutral' ? 1 : 0,
        borderColor: colors.border,
        opacity: disabled ? 0.5 : 1,
        hover: disabled ? {} : { backgroundColor: tone === 'primary' ? '#5eead4' : colors.borderStrong },
        active: disabled ? {} : { opacity: 0.82 },
      }}
    >
      <text style={{ color: textColor, fontFamily: FONT, fontSize: 13, fontWeight: 650 }}>
        {children}
      </text>
    </div>
  )
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent'
}) {
  const textColor =
    tone === 'success'
      ? colors.success
      : tone === 'warning'
        ? colors.warning
        : tone === 'danger'
          ? colors.danger
          : tone === 'accent'
            ? colors.accent
            : colors.textMuted

  return (
    <div
      style={{
        alignSelf: 'flex-start',
        paddingTop: 4,
        paddingBottom: 4,
        paddingLeft: 8,
        paddingRight: 8,
        borderRadius: 99,
        backgroundColor: colors.surfaceRaised,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <text style={{ color: textColor, fontFamily: FONT, fontSize: 11, fontWeight: 650 }}>
        {children}
      </text>
    </div>
  )
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: 18,
        borderRadius: 14,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      {children}
    </div>
  )
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <text style={{ color: colors.text, fontFamily: FONT, fontSize: 17, fontWeight: 700 }}>
          {title}
        </text>
        {description ? (
          <text style={{ color: colors.textMuted, fontFamily: FONT, fontSize: 12 }}>
            {description}
          </text>
        ) : null}
      </div>
      {action}
    </div>
  )
}

export function MetricCard({
  label,
  value,
  detail,
  accent = colors.accent,
}: {
  label: string
  value: string
  detail: string
  accent?: string
}) {
  return (
    <div
      style={{
        flexGrow: 1,
        minWidth: 150,
        padding: 16,
        borderRadius: 12,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 8,
      }}
    >
      <text style={{ color: colors.textMuted, fontFamily: FONT, fontSize: 12 }}>{label}</text>
      <text style={{ color: accent, fontFamily: FONT, fontSize: 24, fontWeight: 730 }}>{value}</text>
      <text style={{ color: colors.textFaint, fontFamily: FONT, fontSize: 11 }}>{detail}</text>
    </div>
  )
}

export function Toggle({
  value,
  onChange,
  testId,
  disabled = false,
}: {
  value: boolean
  onChange: (value: boolean) => void
  testId?: string
  disabled?: boolean
}) {
  return (
    <div
      testId={testId}
      onClick={() => !disabled && onChange(!value)}
      style={{
        width: 42,
        height: 24,
        padding: 3,
        borderRadius: 99,
        cursor: disabled ? 'default' : 'pointer',
        backgroundColor: value ? colors.accent : colors.borderStrong,
        alignItems: value ? 'flex-end' : 'flex-start',
        justifyContent: 'center',
        opacity: disabled ? 0.45 : 1,
        hover: disabled ? {} : { opacity: 0.86 },
      }}
    >
      <div style={{ width: 18, height: 18, borderRadius: 99, backgroundColor: '#ffffff' }} />
    </div>
  )
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div
      style={{
        paddingTop: 56,
        paddingBottom: 56,
        alignItems: 'center',
        gap: 8,
        borderRadius: 14,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <text style={{ color: colors.text, fontFamily: FONT, fontSize: 15, fontWeight: 650 }}>{title}</text>
      <text style={{ color: colors.textMuted, fontFamily: FONT, fontSize: 12 }}>{detail}</text>
    </div>
  )
}
