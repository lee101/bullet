/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        orbitron: ['Orbitron', 'system-ui', 'sans-serif'],
        rajdhani: ['Rajdhani', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
