import { ref, watchEffect } from 'vue'

const THEME_KEY = 'app-theme'

type Theme = 'light' | 'dark'

const currentTheme = ref<Theme>((localStorage.getItem(THEME_KEY) as Theme) || 'light')

/**
 * Toggles the theme between light and dark mode.
 */
export function toggleTheme() {
  currentTheme.value = currentTheme.value === 'light' ? 'dark' : 'light'
}

/**
 * Returns true if the current theme is dark mode.
 */
export function isDarkMode() {
  return currentTheme.value === 'dark'
}

/**
 * Watch for theme changes and update the body class and localStorage.
 */
watchEffect(() => {
  localStorage.setItem(THEME_KEY, currentTheme.value)
  if (currentTheme.value === 'dark') {
    document.body.classList.add('dark-theme')
  } else {
    document.body.classList.remove('dark-theme')
  }
})

export const useTheme = () => ({
  currentTheme,
  toggleTheme,
  isDarkMode
})
