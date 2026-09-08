import { runtimeRole } from './runtime'

// Load only the selected role: headless/elevated processes must not initialize GPUIX.
switch (runtimeRole(process.argv.slice(2))) {
  case 'core':
    await import('./relay-core/main')
    break
  case 'helper':
    await import('./relay-helper/main')
    break
  case 'ui':
    await import('./ui/main')
    break
}
