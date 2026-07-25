import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Verde-pinho: a cor da marca (barra, botoes, paineis escuros, titulos).
        pine: {
          DEFAULT: "#1C3A31",
          deep: "#14261F",
          700: "#274B40",
          600: "#356154",
          400: "#5C7C6F",
        },
        ivory: "#F4EFE4", // papel quente do fundo
        cream: "#FBF8F1", // superficie dos cards
        honey: {
          DEFAULT: "#C6892B", // acento unico (destaques, acao, positivo)
          soft: "#E7B75A",
          deep: "#A9711C",
        },
        sage: "#8A9B8E", // bordas e texto secundario
        ink: "#22241F", // texto principal
        clay: "#B04A2F", // despesas / negativo
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.25rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(28,58,49,0.04), 0 8px 24px -12px rgba(28,58,49,0.14)",
        hero: "0 24px 60px -28px rgba(20,38,31,0.55)",
      },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        rise: "rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
      },
    },
  },
  plugins: [],
};

export default config;
