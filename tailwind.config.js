/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Primarios
        'rich-black': '#021B1A',
        'dark-green': '#032221',
        'bangladesh-green': '#03624C',
        'mountain-meadow': '#2CC295',
        'caribbean-green': '#00DF81',
        'anti-flash-white': '#F1F7F6',
        // Secundarios
        'pine': '#06302B',
        'basil': '#0B453A',
        'forest': '#095544',
        'frog': '#17876D',
        'mint': '#2FA98C',
        'stone': '#707D7D',
        'pistachio': '#AACBC4',
        // Estados
        'success': '#00DF81',
        'warning': '#F5A524',
        'danger': '#F45B69',
        'info': '#5B9BD5',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        '88': '22rem',
      },
      borderRadius: {
        'xl2': '1.25rem',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'wave': 'wave 1s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateX(-10px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        wave: {
          '0%, 100%': { transform: 'scaleY(0.4)' },
          '50%': { transform: 'scaleY(1)' },
        },
      },
    },
  },
  plugins: [],
};
