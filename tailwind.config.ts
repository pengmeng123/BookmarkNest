import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        muted: 'hsl(var(--muted))',
        'muted-foreground': 'hsl(var(--muted-foreground))',
        primary: 'hsl(var(--primary))',
        'primary-foreground': 'hsl(var(--primary-foreground))',
        surface: 'hsl(var(--surface))',
        accent: 'hsl(var(--accent))',
        danger: 'hsl(var(--danger))'
      },
      borderRadius: {
        app: '8px'
      }
    }
  },
  plugins: []
} satisfies Config;
