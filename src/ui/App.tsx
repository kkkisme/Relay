const navItems = ['Dashboard', 'Proxies', 'Profiles', 'Connections', 'Logs', 'Settings']

export function App() {
  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        backgroundColor: '#0f172a',
      }}
    >
      <div
        style={{
          width: 220,
          padding: 20,
          backgroundColor: '#111827',
          borderRightWidth: 1,
          borderRightColor: '#1f2937',
        }}
      >
        <text
          style={{
            color: '#f8fafc',
            fontSize: 22,
            fontWeight: 700,
            marginBottom: 24,
          }}
        >
          Relay
        </text>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {navItems.map((item) => (
            <div
              key={item}
              style={{
                paddingTop: 10,
                paddingBottom: 10,
                paddingLeft: 12,
                paddingRight: 12,
                borderRadius: 8,
                cursor: 'pointer',
                hover: {
                  backgroundColor: '#1e293b',
                },
              }}
            >
              <text style={{ color: '#cbd5e1', fontSize: 14 }}>{item}</text>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flexGrow: 1, padding: 32 }}>
        <text style={{ color: '#f8fafc', fontSize: 28, fontWeight: 700 }}>Dashboard</text>
        <text style={{ color: '#94a3b8', fontSize: 14, marginTop: 8 }}>
          Relay is ready for core integration.
        </text>
      </div>
    </div>
  )
}
