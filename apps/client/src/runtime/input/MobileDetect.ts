let _isMobile: boolean | null = null;

/**
 * Detects whether the current device is a mobile/touch-primary device.
 * Combines feature detection with UA check to avoid false positives
 * on touch-enabled laptops. Result is cached for the session.
 */
export function isMobileDevice(): boolean {
  if (_isMobile !== null) return _isMobile;
  _isMobile =
    "ontouchstart" in window &&
    navigator.maxTouchPoints > 0 &&
    /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return _isMobile;
}
