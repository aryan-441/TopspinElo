/** Mark table edges only while more columns are hidden on that side. */
export function installTableEdges() {
  const tables = new Map<HTMLTableElement, HTMLElement>();
  function mark(host: HTMLElement) {
    const end = host.scrollWidth - host.clientWidth;
    host.toggleAttribute('data-more-left', end > 1 && host.scrollLeft > 1);
    host.toggleAttribute('data-more-right', end > 1 && host.scrollLeft < end - 1);
  }
  const resize = new ResizeObserver(entries => {
    for (const {target} of entries) {
      const host = target instanceof HTMLTableElement ? tables.get(target) : target as HTMLElement;
      if (host) mark(host);
    }
  });
  const scrollbarTimers = new Map<HTMLElement, number>();
  function scroll(event: Event) {
    const host = event.currentTarget as HTMLElement;
    mark(host);
    host.setAttribute('data-table-scrolling', '');
    clearTimeout(scrollbarTimers.get(host));
    scrollbarTimers.set(host, window.setTimeout(() => {
      host.removeAttribute('data-table-scrolling');
      scrollbarTimers.delete(host);
    }, 500));
  }
  function detach(table: HTMLTableElement, host: HTMLElement) {
    host.removeEventListener('scroll', scroll);
    clearTimeout(scrollbarTimers.get(host));
    scrollbarTimers.delete(host);
    resize.unobserve(table);
    resize.unobserve(host);
    tables.delete(table);
  }
  function register(table: HTMLTableElement) {
    if (tables.has(table)) return;
    let host = table.parentElement;
    while (host && !['auto','scroll'].includes(getComputedStyle(host).overflowX)) host = host.parentElement;
    if (!host) return;
    tables.set(table,host);
    host.addEventListener('scroll',scroll,{passive:true});
    resize.observe(host);
    resize.observe(table);
    mark(host);
  }
  document.querySelectorAll('table').forEach(register);
  const changes = new MutationObserver(records => {
    for (const [table,host] of tables) if (!table.isConnected) detach(table,host);
    for (const record of records) for (const node of record.addedNodes) {
      if (node instanceof HTMLTableElement) register(node);
      else if (node instanceof HTMLElement) node.querySelectorAll('table').forEach(register);
    }
  });
  changes.observe(document.body,{childList:true,subtree:true});
  return () => { changes.disconnect(); for (const [table,host] of tables) detach(table,host); resize.disconnect(); };
}
