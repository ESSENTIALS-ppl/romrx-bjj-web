/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Safelist sport-themed classes used via dynamic accent lookup in
  // Layout.tsx → getThemeClasses(). Without this, JIT may strip them.
  safelist: [
    // teal (BJJ)
    'text-teal', 'bg-teal', 'border-teal-light', 'bg-teal-light', 'hover:bg-teal-light', 'hover:text-teal',
    // crimson (Bodybuilding)
    'text-crimson', 'bg-crimson', 'border-crimson-light', 'bg-crimson-light', 'hover:bg-crimson-light', 'hover:text-crimson',
    // slate (General)
    'text-slate-700', 'bg-slate-700', 'text-slate-800', 'border-slate-200', 'bg-slate-100', 'hover:bg-slate-100', 'hover:text-slate-800',
  ],
  theme: {
    extend: {
      colors: {
        teal:    { DEFAULT: '#008080', dark: '#006666', light: '#e6f5f5' },
        crimson: { DEFAULT: '#a4133c', dark: '#800f30', light: '#fde2e8' },
        gold:    { DEFAULT: '#FFB347', light: '#fff3cd' },
        charcoal:{ DEFAULT: '#36454F', light: '#5a7070' },
        surface: '#F4F7F7',
        green:   { tier: '#1a5e2a', 'tier-bg': '#d4edda' },
        yellow:  { tier: '#7c5e00', 'tier-bg': '#fff3cd' },
        red:     { tier: '#8b1a1a', 'tier-bg': '#fde8e8' },
        delay:   { tier: '#5c3d00', 'tier-bg': '#fef3cd' },
      },
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        display: ['Montserrat', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
