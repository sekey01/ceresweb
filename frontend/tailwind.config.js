/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#1D4ED8",
          light: "#DBEAFE",
          dark: "#1E40AF",
          mid: "#93C5FD",
        }
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Courier New", "monospace"],
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scan-rays': {
          '0%, 6%': { opacity: '0', transform: 'translateY(0px)' },
          '10%': { opacity: '1', transform: 'translateY(0px)' },
          '34%': { opacity: '1', transform: 'translateY(64px)' },
          '40%, 100%': { opacity: '0', transform: 'translateY(64px)' },
        },
        'upload-rays': {
          '0%, 40%': { opacity: '0', transform: 'translateY(0px)' },
          '44%': { opacity: '1', transform: 'translateY(0px)' },
          '68%': { opacity: '0', transform: 'translateY(-26px)' },
          '100%': { opacity: '0', transform: 'translateY(0px)' },
        },
        'scan-cloud-pulse': {
          '0%, 100%': { transform: 'translateY(0) scale(1)', filter: 'drop-shadow(0 0 0px rgba(255,255,255,0))' },
          '50%': { transform: 'translateY(-4px) scale(1)', filter: 'drop-shadow(0 0 0px rgba(255,255,255,0))' },
          '65%': { transform: 'translateY(-4px) scale(1.08)', filter: 'drop-shadow(0 0 16px rgba(255,255,255,0.65))' },
          '80%': { transform: 'translateY(-2px) scale(1.01)', filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.3))' },
        },
        'scan-text': {
          '0%, 68%': { opacity: '0', transform: 'translateY(6px) scale(0.92)' },
          '76%': { opacity: '1', transform: 'translateY(0) scale(1)' },
          '92%': { opacity: '1', transform: 'translateY(0) scale(1)' },
          '100%': { opacity: '0', transform: 'translateY(-4px) scale(0.96)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.18s ease-out both',
        'scan-rays': 'scan-rays 6s ease-in-out infinite',
        'upload-rays': 'upload-rays 6s ease-in-out infinite',
        'scan-cloud-pulse': 'scan-cloud-pulse 6s ease-in-out infinite',
        'scan-text': 'scan-text 6s ease-in-out infinite',
      },
    }
  },
  plugins: [],
}
