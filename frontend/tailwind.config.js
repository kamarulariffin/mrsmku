/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0d9488',
          foreground: '#ffffff',
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a'
        },
        secondary: {
          DEFAULT: '#e879f9',
          foreground: '#ffffff',
          100: '#fdf4ff',
          200: '#fae8ff',
          300: '#f5d0fe',
          400: '#f0abfc',
          500: '#e879f9',
          600: '#d946ef'
        },
        pastel: {
          mint: '#a7f3d0',
          lavender: '#e9d5ff',
          peach: '#fed7aa',
          sky: '#bae6fd',
          rose: '#fecdd3',
          cream: '#fef3c7',
          sage: '#bbf7d0',
          lilac: '#ddd6fe'
        },
        background: {
          body: '#fafaf9',
          card: '#ffffff',
          sidebar: '#ffffff'
        }
      },
      fontFamily: {
        heading: ['Outfit', 'sans-serif'],
        body: ['Public Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'fade-in-up': 'fadeInUp 0.5s ease-out',
        'slide-in-right': 'slideInRight 0.4s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
        'float': 'float 4s ease-in-out infinite',
        'shimmer': 'shimmer 2s ease-in-out infinite',
        'soft-pulse': 'softPulse 2.5s ease-in-out infinite'
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' }
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' }
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' }
        },
        shimmer: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' }
        },
        softPulse: {
          '0%, 100%': { boxShadow: '0 4px 20px -2px rgba(0,0,0,0.06)' },
          '50%': { boxShadow: '0 8px 30px -4px rgba(0,0,0,0.08)' }
        }
      },
      boxShadow: {
        'pastel-sm': '0 2px 12px -2px rgba(167, 243, 208, 0.25), 0 4px 8px -4px rgba(233, 213, 255, 0.2)',
        'pastel': '0 8px 24px -4px rgba(167, 243, 208, 0.2), 0 4px 12px -2px rgba(233, 213, 255, 0.15)',
        'pastel-lg': '0 20px 40px -8px rgba(167, 243, 208, 0.2), 0 8px 20px -4px rgba(233, 213, 255, 0.15)',
        'card-soft': '0 4px 20px -2px rgba(0,0,0,0.06), 0 0 0 1px rgba(255,255,255,0.8)'
      }
    },
  },
  plugins: [],
}
