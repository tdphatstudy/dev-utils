// Preserve each CSS token's own alpha while supporting Tailwind /opacity variants.
// color-mix is available in the Chromium version bundled with Electron.
const macColor = (token) => ({ opacityValue }) => opacityValue === undefined
  ? `var(--mac-${token})`
  : `color-mix(in srgb, var(--mac-${token}) calc(${opacityValue} * 100%), transparent)`
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        mac: {
          // Light
          bg: macColor('bg'),
          surface: macColor('surface'),
          raised: macColor('raised'),
          overlay: macColor('overlay'),
          sidebar: macColor('sidebar'),
          separator: macColor('separator'),
          label: macColor('label'),
          'label-secondary': macColor('label-secondary'),
          'label-tertiary': macColor('label-tertiary'),
          accent: macColor('accent'),
          'accent-hover': macColor('accent-hover'),
          'accent-fill': macColor('accent-fill'),
          'accent-fill-hover': macColor('accent-fill-hover'),
          'accent-soft': macColor('accent-soft'),
          control: macColor('control'),
          'control-hover': macColor('control-hover'),
          danger: macColor('danger'),
          success: macColor('success'),
          warning: macColor('warning')
        }
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Text',
          'Segoe UI',
          'Helvetica Neue',
          'Arial',
          'sans-serif'
        ],
        mono: [
          'SF Mono',
          'JetBrains Mono',
          'ui-monospace',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace'
        ]
      },
      borderRadius: {
        mac: '8px',
        'mac-lg': '12px',
        'mac-xl': '14px'
      },
      boxShadow: {
        mac: '0 0 0 0.5px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.08)',
        'mac-lg': '0 0 0 0.5px rgba(0,0,0,0.08), 0 8px 32px rgba(0,0,0,0.12)',
        'mac-dark': '0 0 0 0.5px rgba(255,255,255,0.06), 0 2px 8px rgba(0,0,0,0.4)'
      },
      transitionTimingFunction: {
        mac: 'cubic-bezier(0.25, 0.1, 0.25, 1)'
      }
    }
  },
  plugins: []
}
