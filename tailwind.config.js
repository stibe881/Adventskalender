/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./public/**/*.html", "./public/**/*.js"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        display: ["'Playfair Display'", "serif"],
        sans: ["'Inter'", "system-ui", "sans-serif"],
      },
      keyframes: {
        shake: {
          "0%, 100%": { transform: "translateX(0) rotate(0deg)" },
          "15%": { transform: "translateX(-6px) rotate(-2deg)" },
          "30%": { transform: "translateX(5px) rotate(2deg)" },
          "45%": { transform: "translateX(-4px) rotate(-1.5deg)" },
          "60%": { transform: "translateX(4px) rotate(1.5deg)" },
          "75%": { transform: "translateX(-2px) rotate(-1deg)" },
          "90%": { transform: "translateX(2px) rotate(1deg)" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 0px rgba(255,255,255,0)" },
          "50%": { boxShadow: "0 0 24px rgba(255,255,255,0.35)" },
        },
      },
      animation: {
        shake: "shake 0.5s ease-in-out",
        "pulse-glow": "pulse-glow 2.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
