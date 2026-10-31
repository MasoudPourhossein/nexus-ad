export function initTheme(): void {
  let theme = 'dark';
  try {
    theme = localStorage.getItem('nx_theme') ?? 'dark';
  } catch {
    // ignore
  }
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function toggleTheme(): void {
  const dark = !document.documentElement.classList.contains('dark');
  document.documentElement.classList.toggle('dark', dark);
  try {
    localStorage.setItem('nx_theme', dark ? 'dark' : 'light');
  } catch {
    // ignore
  }
}
