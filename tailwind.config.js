/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        teal:   { DEFAULT: '#008080', dark: '#006666', light: '#e6f5f5' },
        gold:   { DEFAULT: '#FFB347', light: '#fff3cd' },
        charcoal: { DEFAULT: '#36454F', light: '#5a7070' },
        surface: '#F4F7F7',
        green:  { tier: '#1a5e2a', 'tier-bg': '#d4edda' },
        yellow: { tier: '#7c5e00', 'tier-bg': '#fff3cd' },
        red:    { tier: '#8b1a1a', 'tier-bg': '#fde8e8' },
        delay:  { tier: '#5c3d00', 'tier-bg': '#fef3cd' },
      },
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        display: ['Montserrat', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
