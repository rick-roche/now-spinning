/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "primary": "#f27f0d",
        "background-light": "#f8f7f5",
        "background-dark": "#221910",
        "surface-dark": "#1e160f",
        "border-dark": "#2d241c",
        "text-muted": "#baab9c",
        "accent-dark": "#393028",
      },
      fontFamily: {
        "display": ["Spline Sans", "sans-serif"],
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "2xl": "1rem",
        "3xl": "1.5rem",
        "full": "9999px",
      },
    },
  },
}
