import { render } from '@gpuix/react'
import { App } from './ui/App'

render(<App />, {
  title: 'Relay',
  appName: 'Relay',
  width: 1180,
  height: 760,
  titlebarTransparent: true,
  windowBackground: 'opaque',
  trafficLightX: 18,
  trafficLightY: 18,
})
