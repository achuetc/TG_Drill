/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{svelte,js,ts}'],
  theme: {
    extend: {
      colors: {
        drill: {
          dark: '#0d0d1a',
          panel: '#1a1a2e',
          border: '#2a2a4a',
          accent: '#f59e0b',
          danger: '#ef4444',
          good: '#22c55e',
        },
      },
    },
  },
  plugins: [],
}
