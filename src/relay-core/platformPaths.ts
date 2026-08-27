import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

type Environment = NodeJS.ProcessEnv

export function relayPaths(
  platform = process.platform,
  environment: Environment = process.env,
  home = homedir(),
) {
  const root = environment.RELAY_DATA_DIR ?? (
    platform === 'win32'
      ? join(environment.APPDATA ?? join(home, 'AppData', 'Roaming'), 'Relay')
      : platform === 'darwin'
        ? join(home, 'Library', 'Application Support', 'Relay')
        : join(environment.XDG_CONFIG_HOME ?? join(home, '.config'), 'relay')
  )
  const stateRoot = platform === 'linux'
    ? environment.XDG_STATE_HOME
      ? join(environment.XDG_STATE_HOME, 'relay')
      : join(home, '.local', 'state', 'relay')
    : root

  return {
    root,
    settings: join(root, 'settings.json'),
    profiles: environment.RELAY_PROFILE_DIR ?? join(root, 'profiles'),
    mihomo: environment.RELAY_MIHOMO_CONFIG_DIR ?? join(root, 'mihomo'),
    recovery: join(root, 'system-proxy-recovery.json'),
    logs: join(stateRoot, 'logs'),
  }
}
