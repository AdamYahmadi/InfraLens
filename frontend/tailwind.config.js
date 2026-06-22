/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        panel: '#1a1a1a',
        chart: '#121212',
      }
    },
  },
  plugins: [],
}