import { app } from 'electron'
import { join } from 'path'
import {
  APP_DATA_DIR,
  DEFAULT_SECRET_BOX_DIR,
  DEVICE_SECRET_FILE,
  SECRET_BOX_REGISTRY_FILE
} from '@shared/core/constants'

export function userDataRoot(): string {
  return app.getPath('userData')
}

export function appDataRoot(): string {
  return join(userDataRoot(), APP_DATA_DIR)
}

export function defaultSecretBoxPath(): string {
  return join(appDataRoot(), DEFAULT_SECRET_BOX_DIR)
}

export function secretBoxRegistryPath(): string {
  return join(userDataRoot(), SECRET_BOX_REGISTRY_FILE)
}

export function deviceSecretPath(): string {
  return join(userDataRoot(), DEVICE_SECRET_FILE)
}
