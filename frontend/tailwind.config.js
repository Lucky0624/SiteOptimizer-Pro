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
        cyber: {
          bg: 'var(--bg-base)',
          card: 'var(--bg-card)',
          elevated: 'var(--bg-elevated)',
          text: 'var(--text-primary)',
          muted: 'var(--text-secondary)',
          cyan: 'var(--accent-cyan)',
          purple: 'var(--accent-purple)',
          success: 'var(--accent-success)',
          warning: 'var(--accent-warning)',
          error: 'var(--accent-error)',
          border: 'var(--border-color)',
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'glow-cyan': 'var(--shadow-glow-cyan)',
        'glow-purple': 'var(--shadow-glow-purple)',
        'glow-cyan-sm': '0 0 10px rgba(0, 200, 230, 0.2)',
        'glow-purple-sm': '0 0 10px rgba(140, 30, 200, 0.2)',
        'glass': 'var(--shadow-glass)',
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(0, 200, 230, 0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(0, 200, 230, 0.6)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
    },
  },
  plugins: [],
}
