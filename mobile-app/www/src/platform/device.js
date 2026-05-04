export function detectIOSDevice() {
  const ua = String(navigator.userAgent || '');
  const platform = String(navigator.platform || '');
  const maxTouchPoints = Number(navigator.maxTouchPoints || 0);

  return /iPad|iPhone|iPod/i.test(ua) || (/Mac/i.test(platform) && maxTouchPoints > 1);
}

export function detectAndroidChromeDevice() {
  const ua = String(navigator.userAgent || '');
  return /Android/i.test(ua) && /Chrome\//i.test(ua) && !/EdgA|OPR|SamsungBrowser/i.test(ua);
}
