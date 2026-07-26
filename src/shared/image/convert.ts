export type ImageOutFormat = 'png' | 'jpeg' | 'webp'
export type ResizeMode = 'percent' | 'max' | 'exact'
export type FitMode = 'contain' | 'cover' | 'stretch'

export interface ResizeOptions {
  mode: ResizeMode
  /** percent 1–500 when mode=percent */
  percent?: number
  maxWidth?: number
  maxHeight?: number
  width?: number
  height?: number
  fit?: FitMode
}

export interface SizeResult {
  width: number
  height: number
}

export function mimeForFormat(format: ImageOutFormat): string {
  switch (format) {
    case 'png':
      return 'image/png'
    case 'jpeg':
      return 'image/jpeg'
    case 'webp':
      return 'image/webp'
  }
}

export function extForFormat(format: ImageOutFormat): string {
  return format === 'jpeg' ? 'jpg' : format
}

export function clampQuality(q: number): number {
  if (Number.isNaN(q)) return 0.92
  return Math.min(1, Math.max(0.05, q))
}

/**
 * Compute output pixel size from source dimensions + resize options.
 */
export function computeTargetSize(
  srcW: number,
  srcH: number,
  opts: ResizeOptions
): SizeResult {
  if (srcW <= 0 || srcH <= 0) return { width: 1, height: 1 }

  if (opts.mode === 'percent') {
    const p = Math.min(500, Math.max(1, opts.percent ?? 100)) / 100
    return {
      width: Math.max(1, Math.round(srcW * p)),
      height: Math.max(1, Math.round(srcH * p))
    }
  }

  if (opts.mode === 'max') {
    const maxW = opts.maxWidth && opts.maxWidth > 0 ? opts.maxWidth : srcW
    const maxH = opts.maxHeight && opts.maxHeight > 0 ? opts.maxHeight : srcH
    const scale = Math.min(1, maxW / srcW, maxH / srcH)
    return {
      width: Math.max(1, Math.round(srcW * scale)),
      height: Math.max(1, Math.round(srcH * scale))
    }
  }

  // exact
  const tw = opts.width && opts.width > 0 ? opts.width : srcW
  const th = opts.height && opts.height > 0 ? opts.height : srcH
  const fit = opts.fit ?? 'contain'

  if (fit === 'stretch') {
    return { width: Math.max(1, Math.round(tw)), height: Math.max(1, Math.round(th)) }
  }

  const scale =
    fit === 'cover' ? Math.max(tw / srcW, th / srcH) : Math.min(tw / srcW, th / srcH)

  if (fit === 'cover') {
    // canvas size is the box; drawing will crop — return box size
    return { width: Math.max(1, Math.round(tw)), height: Math.max(1, Math.round(th)) }
  }

  // contain: fit inside box, preserve aspect
  return {
    width: Math.max(1, Math.round(srcW * scale)),
    height: Math.max(1, Math.round(srcH * scale))
  }
}

/** Draw rect for cover mode (centered crop into target box). */
export function coverDrawRect(
  srcW: number,
  srcH: number,
  boxW: number,
  boxH: number
): { sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number } {
  const scale = Math.max(boxW / srcW, boxH / srcH)
  const dw = srcW * scale
  const dh = srcH * scale
  const dx = (boxW - dw) / 2
  const dy = (boxH - dh) / 2
  return { sx: 0, sy: 0, sw: srcW, sh: srcH, dx, dy, dw, dh }
}
