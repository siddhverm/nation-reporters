import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Exact logo colors
        brand:  { DEFAULT: '#D41F26', dark: '#A8181E', light: '#E84249' },
        navy:   { DEFAULT: '#1A3769', light: '#234A8A', dark: '#112650' },
        signal: { DEFAULT: '#F4A420', light: '#F9C46B' },  // logo orange WiFi
      },
      fontFamily: {
        sans:  ['Inter', 'sans-serif'],
        serif: ['Merriweather', 'serif'],
      },
      keyframes: {
        ticker: { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
      },
      animation: {
        ticker: 'ticker 30s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
