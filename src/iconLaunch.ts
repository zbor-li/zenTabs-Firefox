const ICON_LAUNCH_CLASS = 'bookmark-icon-launching';

type IconLaunchState = 'started' | 'running' | 'skipped';

function startIconLaunchAnimation(itemElement: HTMLElement): IconLaunchState {
  const iconElement = itemElement.querySelector<HTMLElement>('.bookmark-icon-container');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!iconElement || prefersReducedMotion) return 'skipped';
  if (iconElement.classList.contains(ICON_LAUNCH_CLASS)) return 'running';

  const clearLaunchState = (event: AnimationEvent) => {
    if (event.target !== iconElement) return;
    iconElement.classList.remove(ICON_LAUNCH_CLASS);
    iconElement.removeEventListener('animationend', clearLaunchState);
    iconElement.removeEventListener('animationcancel', clearLaunchState);
  };

  iconElement.classList.add(ICON_LAUNCH_CLASS);
  iconElement.addEventListener('animationend', clearLaunchState);
  iconElement.addEventListener('animationcancel', clearLaunchState);
  return 'started';
}

export function playIconLaunchAnimation(itemElement: HTMLElement): void {
  startIconLaunchAnimation(itemElement);
}

export function launchWithIconAnimation(
  itemElement: HTMLElement,
  navigate: () => void,
): void {
  const launchState = startIconLaunchAnimation(itemElement);
  if (launchState === 'skipped') {
    navigate();
    return;
  }
  if (launchState === 'running') return;

  // Give the launch animation one painted frame, then start navigation.
  // The animation continues on the current page while the destination loads.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(navigate);
  });
}
