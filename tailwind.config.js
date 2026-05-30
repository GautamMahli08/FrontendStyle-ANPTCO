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
      },
      animation: {
        scanline: 'scanline 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
