/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        mac: {
          // Light
          bg: 'var(--mac-bg)',
          surface: 'var(--mac-surface)',
          raised: 'var(--mac-raised)',
          overlay: 'var(--mac-overlay)',
          sidebar: 'var(--mac-sidebar)',
          separator: 'var(--mac-separator)',
          label: 'var(--mac-label)',
          'label-secondary': 'var(--mac-label-secondary)',
          'label-tertiary': 'var(--mac-label-tertiary)',
          accent: 'var(--mac-accent)',
          'accent-hover': 'var(--mac-accent-hover)',
          'accent-soft': 'var(--mac-accent-soft)',
          control: 'var(--mac-control)',
          'control-hover': 'var(--mac-control-hover)',
          danger: 'var(--mac-danger)',
          success: 'var(--mac-success)',
          warning: 'var(--mac-warning)'
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
