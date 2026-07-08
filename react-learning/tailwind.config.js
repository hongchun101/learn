/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0f172a',
        'bg-elev': '#1e293b',
        'bg-elev-2': '#334155',
        fg: '#e2e8f0',
        'fg-muted': '#94a3b8',
        accent: '#38bdf8',
        danger: '#f87171',
        success: '#4ade80',
      },
    },
  },
  plugins: [],
};
