/** 主页面 index.html 的 Tailwind 配置（提取自原内联 tailwind.config） */
module.exports = {
  content: ['/data/data/com.termux/files/home/tmp/RP-Hub-upstream/index.html', '/data/data/com.termux/files/home/tmp/RP-Hub-upstream/assets/js/*.js'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--app-font-family)', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Microsoft YaHei', 'Noto Sans SC', 'Arial', 'sans-serif'],
        serif: ['var(--app-font-serif)', 'Lora', 'Noto Serif SC', 'Source Han Serif SC', 'Source Han Serif CN', 'STSong', 'SimSun', 'Georgia', 'Cambria', 'Times New Roman', 'Times', 'serif']
      },
      colors: {
        gray: {
          50: '#f9fafb', 100: '#f3f4f6', 200: '#e5e7eb', 300: '#d1d5db',
          400: '#9ca3af', 500: '#6b7280', 600: '#4b5563', 700: '#374151',
          800: '#1f2937', 900: '#111827',
        },
        primary: {
          50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd',
          400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8',
          800: '#1e40af', 900: '#1e3a8a',
        }
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'bounce-slow': 'bounce 1.5s infinite',
      },
      transitionTimingFunction: {
        'modal-fade': 'cubic-bezier(0.22, 0.61, 0.36, 1)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' }, '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        }
      },
      boxShadow: {
        'soft': '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
        'card': '0 0 0 1px rgba(0,0,0,0.03), 0 2px 8px rgba(0,0,0,0.04)',
      }
    }
  },
  plugins: []
};
