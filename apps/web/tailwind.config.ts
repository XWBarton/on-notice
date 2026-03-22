import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      colors: {
        // Party colours (Australian)
        alp: "#E53935",      // ALP red
        lib: "#1565C0",      // Liberal blue
        nat: "#2E7D32",      // Nationals green
        grn: "#43A047",      // Greens green
        ind: "#757575",      // Independent grey
      },
    },
  },
  plugins: [],
};

export default config;
