/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["\"Fraunces\"", "Georgia", "serif"],
        body: ["\"DM Sans\"", "system-ui", "sans-serif"],
      },
      colors: {
        meadow: {
          950: "#0f1a14",
          900: "#16241c",
          700: "#2a4032",
          400: "#6fcf97",
          100: "#e8f2ea",
        },
      },
    },
  },
  plugins: [],
};
