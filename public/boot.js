(() => {
  document.documentElement.classList.add('zen-booting');
  const wallpaper = document.getElementById('zen-boot-wallpaper');
  if (!wallpaper) return;
  try {
    const settings = JSON.parse(localStorage.getItem('zen_settings_snapshot') || 'null');
    if (!settings || typeof settings !== 'object') return;
    if (typeof settings.wallpaperUrl === 'string' && settings.wallpaperUrl) {
      const safeUrl = settings.wallpaperUrl.replaceAll('"', '\\"');
      wallpaper.style.backgroundImage = `url("${safeUrl}")`;
    }
    const blur = Math.min(60, Math.max(0, Number(settings.wallpaperBlur) || 0));
    wallpaper.style.filter = `blur(${blur}px)`;
  } catch {
    // The regular bootstrap repairs an invalid visual snapshot.
  }
})();
