/**
 * Web version of share.ts. whatsapp:// does nothing in a desktop browser, so WhatsApp goes through
 * https://wa.me (opens the app on phones, WhatsApp Web on laptops). Other sharing uses the Web Share
 * API where the browser has it (mostly phones), else copies the text to the clipboard.
 */
export type ShareResult = 'shared' | 'copied' | 'failed';

export async function shareOnWhatsApp(text: string): Promise<ShareResult> {
  const w = window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  if (w !== null) return 'shared';
  // Pop-up blocked (rare: this runs from a tap): navigate instead.
  window.location.assign(`https://wa.me/?text=${encodeURIComponent(text)}`);
  return 'shared';
}

export async function shareText(text: string): Promise<ShareResult> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try { await navigator.share({ text }); return 'shared'; } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'failed';
    }
  }
  try { await navigator.clipboard.writeText(text); return 'copied'; } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok ? 'copied' : 'failed';
  } catch { return 'failed'; }
}
