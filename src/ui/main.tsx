import { render } from '@gpuix/react'
import { App } from './App'

render(<App />, {
  title: 'Relay',
  appName: 'Relay',
  width: 1180,
  height: 760,
  // Keep native Windows caption controls until custom hit-testing is available.
  titlebarTransparent: process.platform !== 'win32',
  windowBackground: 'opaque',
  trafficLightX: 18,
  trafficLightY: 18,
})
