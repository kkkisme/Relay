import { render } from '@gpuix/react'
import { App } from './ui/App'

render(<App />, {
  title: 'Relay',
  appName: 'Relay',
  width: 1180,
  height: 760,
  // Windows needs native window chrome until custom caption hit-testing exists.
  titlebarTransparent: process.platform !== 'win32',
  windowBackground: 'opaque',
  trafficLightX: 18,
  trafficLightY: 18,
})
