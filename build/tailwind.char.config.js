/** 角色页 character/index.html 的 Tailwind + daisyUI 配置 */
module.exports = {
  content: ['/data/data/com.termux/files/home/tmp/RP-Hub-upstream/character/index.html'],
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--app-font-family)', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Microsoft YaHei', 'Noto Sans SC', 'Arial', 'sans-serif'],
        serif: ['var(--app-font-serif)', 'Lora', 'Noto Serif SC', 'Source Han Serif SC', 'Source Han Serif CN', 'STSong', 'SimSun', 'Georgia', 'Cambria', 'Times New Roman', 'Times', 'serif']
      },
      colors: {
        primary: '#65c3c8',
        secondary: '#ef9fbc',
        accent: '#eeaf3a',
      }
    }
  },
  plugins: [require('daisyui')]
};
