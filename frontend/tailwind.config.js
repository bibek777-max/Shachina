/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          dark: '#0a0d14',
          panel: '#101522',
          border: '#1c2438',
          accent: '#00f2fe',
          nepalRed: '#DC143C',
          bullish: '#10b981',
          bearish: '#ef4444',
          gold: '#f59e0b',
        }
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      keyframes: {
        shrink: {
          '0%':   { width: '100%' },
          '100%': { width: '0%' },
        }
      },
      animation: {
        'shrink': 'shrink 10s linear forwards',
      }
    },
  },
  plugins: [],
}
