const ICON_LAUNCH_CLASS = 'bookmark-icon-launching';

export function launchWithIconAnimation(
  itemElement: HTMLElement,
  navigate: () => void,
): void {
  const iconElement = itemElement.querySelector<HTMLElement>('.bookmark-icon-container');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!iconElement || prefersReducedMotion) {
    navigate();
    return;
  }

  if (iconElement.classList.contains(ICON_LAUNCH_CLASS)) return;

  const clearLaunchState = (event: AnimationEvent) => {
    if (event.target !== iconElement) return;
    iconElement.classList.remove(ICON_LAUNCH_CLASS);
    iconElement.removeEventListener('animationend', clearLaunchState);
    iconElement.removeEventListener('animationcancel', clearLaunchState);
  };

  iconElement.classList.add(ICON_LAUNCH_CLASS);
  iconElement.addEventListener('animationend', clearLaunchState);
  iconElement.addEventListener('animationcancel', clearLaunchState);

  // Give the launch animation one painted frame, then start navigation.
  // The animation continues on the current page while the destination loads.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(navigate);
  });
}
