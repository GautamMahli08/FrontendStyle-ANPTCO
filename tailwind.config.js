/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      keyframes: {
        scanline: {
          '0%, 100%': { top: '0%' },
          '50%':      { top: '100%' },
        },
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '200% 50%' },
        },
        aurora: {
          '0%, 100%': { transform: 'translate(-50%, -50%) scale(1)',   opacity: '0.55' },
          '50%':      { transform: 'translate(-50%, -50%) scale(1.18)', opacity: '0.8'  },
        },
      },
      animation: {
        scanline: 'scanline 2s ease-in-out infinite',
        'fade-up': 'fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both',
        shimmer:   'shimmer 4s linear infinite',
        aurora:    'aurora 9s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
