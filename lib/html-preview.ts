export type HtmlPage = { title: string; html: string };
export type HtmlPreview = { pages: HtmlPage[]; width: number | null; height: number | null };

/** DOMParser의 비활성 문서를 분석할 뿐, 원문을 앱 DOM에 삽입하지 않는다. */
export function parseHtmlPreview(html: string): HtmlPreview {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const selectors = ['.slide', '[data-slide]', '.page', '[data-page]'];
  let selector = '';
  let pages: Element[] = [];
  for (const candidate of selectors) {
    const matches = [...document.querySelectorAll(candidate)].filter(el => !el.parentElement?.closest(candidate));
    if (matches.length >= 2) { selector = candidate; pages = matches; break; }
  }
  if (!pages.length) return { pages: [], width: null, height: null };
  const styles = [...document.querySelectorAll('style')].map(el => el.textContent).join('\n');
  // 첫 기본 규칙의 px 크기를 사용해 원문의 모바일/인쇄 규칙과 구분한다.
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = styles.match(new RegExp(`(?:^|[}\\s])${escaped}\\s*\\{([^}]+)\\}`))?.[1] ?? '';
  const inline = pages[0].getAttribute('style') ?? '';
  const dimension = (name: string) => {
    const match = `${inline};${rule}`.match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([0-9.]+)px`, 'i'));
    const value = match ? Number(match[1]) : 0;
    return value >= 100 && value <= 5000 ? value : null;
  };
  const width = dimension('width'), height = dimension('height');
  const display = rule.match(/(?:^|;)\s*display\s*:\s*(flex|grid|block)\b/i)?.[1] ?? 'block';
  return { width, height, pages: pages.map((page, index) => {
    const copy = document.cloneNode(true) as Document;
    const original = [...copy.querySelectorAll(selector)].filter(el => !el.parentElement?.closest(selector))[index];
    const selected = original.cloneNode(true) as HTMLElement;
    selected.removeAttribute('hidden');
    selected.setAttribute('data-material-page', '');
    selected.style.setProperty('display', display, 'important');
    let branch: Element = selected;
    for (let parent = original.parentElement; parent && parent !== copy.body; parent = parent.parentElement) {
      const wrapper = parent.cloneNode(false) as Element;
      wrapper.setAttribute('data-material-wrapper', '');
      wrapper.append(branch); branch = wrapper;
    }
    copy.body.replaceChildren(branch);
    const fit = copy.createElement('style');
    fit.textContent = `html,body{margin:0!important;padding:0!important;min-width:0!important;width:100%!important;scroll-snap-type:none!important} [data-material-wrapper]{margin:0!important;padding:0!important;width:100%!important;min-height:0!important;height:auto!important;transform:none!important;overflow:visible!important} [data-material-page]{margin:0!important;transform:none!important;opacity:1!important;visibility:visible!important;position:relative!important;inset:auto!important;box-sizing:border-box!important}${width && height ? `html,body{height:100%!important;overflow:hidden!important}[data-material-page]{width:${width}px!important;height:${height}px!important}` : ''}`;
    copy.head.append(fit);
    return { title: page.querySelector('h1,h2,h3')?.textContent?.trim().replace(/\s+/g, ' ').slice(0, 100) || `${index + 1}페이지`, html: `<!doctype html>${copy.documentElement.outerHTML}` };
  }) };
}
