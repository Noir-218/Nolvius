/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Nunito Sans"', 'sans-serif'],
      },
      colors: {
        forest: { DEFAULT: '#4F705B', light: '#9DB5A0', dark: '#365542' },
        sage: { DEFAULT: '#9DB5A0', soft: '#DDE8D9' },
        cream: { DEFAULT: '#F3F0E6' },
        'warm-white': { DEFAULT: '#FFFDF7' },
        'soft-gray': { DEFAULT: '#E9E8E1' },
        coffee: { DEFAULT: '#765548' },
        terra: { DEFAULT: '#C78368' },
        ochre: { DEFAULT: '#D3AF65' },
        'text-main': { DEFAULT: '#303A34' },
        'text-secondary': { DEFAULT: '#5F6962' },
        'text-muted': { DEFAULT: '#7B837D' },
        'text-disabled': { DEFAULT: '#A5AAA5' },
        'input-bg': { DEFAULT: '#FFFFFF' },
        'input-border': { DEFAULT: '#D0CCC0' },
        'filter-bg': { DEFAULT: '#F0EDE4' },
        'filter-border': { DEFAULT: '#DDD9CE' },
        
        // Aliases to seamlessly restyle existing classes
        teal: {
          50: '#F3F0E6', // cream
          100: '#DDE8D9', // sage-soft
          200: '#9DB5A0', // sage
          500: '#4F705B', // forest
          600: '#4F705B', // forest
          700: '#365542', // forest-dark
          800: '#365542',
        },
        gray: {
          50: '#F3F0E6', // cream
          100: '#E9E8E1', // soft-gray
          200: '#E4E2D8', // border
          300: '#D1C8B4',
          400: '#778078', // text-muted
          500: '#778078', // text-muted
          600: '#765548', // coffee
          700: '#28332D', // text-main
          800: '#28332D', // text-main
          900: '#1D2521',
        },
        white: '#FFFDF7', // warm-white
      },
      borderRadius: {
        'md': '10px',
        'lg': '12px',
        'xl': '16px',
        '2xl': '20px', // 18-22px requested
        '3xl': '24px',
        'pill': '9999px',
      },
      boxShadow: {
        'sm': '0 1px 2px 0 rgba(79, 112, 91, 0.03)',
        DEFAULT: '0 2px 8px -2px rgba(79, 112, 91, 0.05)',
        'md': '0 2px 8px -2px rgba(79, 112, 91, 0.05)',
        'lg': '0 4px 12px -3px rgba(79, 112, 91, 0.06)',
        'xl': '0 10px 24px -4px rgba(79, 112, 91, 0.08)',
        'soft': '0 2px 8px -2px rgba(79, 112, 91, 0.05)',
        'soft-lg': '0 4px 12px -3px rgba(79, 112, 91, 0.06)',
      }
    },
  },
  plugins: [],
}
