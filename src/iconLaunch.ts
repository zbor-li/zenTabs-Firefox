const ICON_LAUNCH_CLASS = 'zen-launch-animating';
export const ZEN_NAVIGATION_START_EVENT = 'zen-navigation-start';

type IconLaunchState = 'started' | 'running' | 'skipped';

const launchCleanupByElement = new WeakMap<HTMLElement, () => void>();

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function cancelElementLaunchAnimation(element: HTMLElement): void {
  const cleanup = launchCleanupByElement.get(element);
  if (cleanup) {
    cleanup();
    return;
  }
  element.classList.remove(ICON_LAUNCH_CLASS);
}

function addElementLaunchAnimation(element: HTMLElement): void {
  let cleared = false;
  const clearLaunchState = () => {
    if (cleared) return;
    cleared = true;
    element.removeEventListener('animationend', handleAnimationEnd);
    element.removeEventListener('animationcancel', handleAnimationEnd);
    element.classList.remove(ICON_LAUNCH_CLASS);
    launchCleanupByElement.delete(element);
  };
  const handleAnimationEnd = (event: AnimationEvent) => {
    if (event.target !== element || event.animationName !== 'bookmarkIconLaunch') return;
    clearLaunchState();
  };

  launchCleanupByElement.set(element, clearLaunchState);
  element.addEventListener('animationend', handleAnimationEnd);
  element.addEventListener('animationcancel', handleAnimationEnd);
  element.classList.add(ICON_LAUNCH_CLASS);
}

function startElementLaunchAnimation(element: HTMLElement): IconLaunchState {
  if (!element.isConnected || prefersReducedMotion()) return 'skipped';
  if (element.classList.contains(ICON_LAUNCH_CLASS)) return 'running';

  addElementLaunchAnimation(element);
  return 'started';
}

export function playElementLaunchAnimation(element: HTMLElement): void {
  startElementLaunchAnimation(element);
}

export function playSynchronizedLaunchAnimations(elements: Iterable<HTMLElement>): void {
  if (prefersReducedMotion()) return;

  const targets = Array.from(new Set(elements)).filter(element => element.isConnected);
  if (!targets.length) return;

  targets.forEach(cancelElementLaunchAnimation);
  void document.documentElement.offsetWidth;
  targets.forEach(addElementLaunchAnimation);
}

function getBookmarkIconElement(itemElement: HTMLElement): HTMLElement | null {
  return itemElement.querySelector<HTMLElement>('.bookmark-icon-container');
}

function startIconLaunchAnimation(itemElement: HTMLElement): IconLaunchState {
  const iconElement = getBookmarkIconElement(itemElement);
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!iconElement || prefersReducedMotion) return 'skipped';
  return startElementLaunchAnimation(iconElement);
}

function restartIconLaunchAnimation(itemElement: HTMLElement): IconLaunchState {
  const iconElement = getBookmarkIconElement(itemElement);
  if (!iconElement || prefersReducedMotion()) return 'skipped';

  cancelElementLaunchAnimation(iconElement);
  void iconElement.offsetWidth;
  addElementLaunchAnimation(iconElement);
  return 'started';
}

export function playIconLaunchAnimation(itemElement: HTMLElement): void {
  startIconLaunchAnimation(itemElement);
}

export function launchWithIconAnimation(
  itemElement: HTMLElement,
  navigate: () => void,
): void {
  // Stop any queued page-entry/search animation before the outbound link
  // animation starts. This event is synchronous so consumers can cancel
  // requestAnimationFrame callbacks before the next paint.
  window.dispatchEvent(new Event(ZEN_NAVIGATION_START_EVENT));

  // A quick click can happen while the shared page-entry animation is still
  // running. Restart only the clicked icon so it gets its own launch motion.
  const launchState = restartIconLaunchAnimation(itemElement);
  if (launchState === 'skipped') {
    navigate();
    return;
  }

  // Give the launch animation one painted frame, then start navigation.
  // The animation continues on the current page while the destination loads.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(navigate);
  });
}
