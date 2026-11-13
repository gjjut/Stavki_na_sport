import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"Inter Variable"',
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'sans-serif',
        ],
        mono: [
          '"JetBrains Mono Variable"',
          '"JetBrains Mono"',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
      },
      boxShadow: {
        '2xs': '0 1px 2px 0 rgba(15, 23, 42, 0.03)',
        xs: '0 1px 3px 0 rgba(15, 23, 42, 0.05), 0 1px 2px -1px rgba(15, 23, 42, 0.04)',
        card: '0 2px 8px -2px rgba(15, 23, 42, 0.06), 0 1px 3px 0 rgba(15, 23, 42, 0.04)',
        'card-hover':
          '0 14px 32px -8px rgba(37, 99, 235, 0.14), 0 4px 12px -2px rgba(15, 23, 42, 0.06)',
      },
    },
  },
  plugins: [],
};

export default config;
