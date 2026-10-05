import { analyzeYaml } from '@shared/yaml'

self.onmessage = (event: MessageEvent<string>): void => {
  self.postMessage(analyzeYaml(event.data))
}
