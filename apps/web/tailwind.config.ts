import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  // Preflight would restyle the ported terraplan.css (buttons, tables, headings).
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        tp: {
          bg: 'var(--bg)',
          fg: 'var(--fg)',
          muted: 'var(--mut)',
          line: 'var(--line)',
          card: 'var(--card)',
          accent: 'var(--acc)',
          ok: 'var(--ok)',
          bad: 'var(--bad)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
