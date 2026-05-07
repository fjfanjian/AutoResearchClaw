/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0f1117',
          raised: '#161b22',
          overlay: '#1c2333',
          border: '#30363d',
        },
        accent: {
          DEFAULT: '#58a6ff',
          dim: '#388bfd',
          bright: '#79c0ff',
        },
        success: '#3fb950',
        warning: '#d29922',
        danger: '#f85149',
        muted: '#8b949e',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'monospace'],
      },
      animation: {
        pulse_slow: 'pulse 2.5s cubic-bezier(0.4,0,0.6,1) infinite',
      },
    },
  },
  plugins: [],
}
