const stateKey = 'mowooNavigation';
interface SavedPosition { windowY: number; regions: Record<string, number> }
interface NavigationEntry { index: number; position: SavedPosition }
const emptyPosition = (): SavedPosition => ({ windowY: 0, regions: {} });

function entry(): NavigationEntry | undefined {
  return history.state?.[stateKey];
}
export function initializeNavigation() {
  if (!entry()) history.replaceState({ ...history.state, [stateKey]: { index: 0, position: emptyPosition() } }, '');
}
export function rememberPosition() {
  initializeNavigation();
  const regions: Record<string, number> = {};
  document.querySelectorAll<HTMLElement>('[data-scroll-key]').forEach(node => {
    regions[node.dataset.scrollKey!] = node.scrollTop;
  });
  history.replaceState({ ...history.state, [stateKey]: { ...entry(), position: { windowY: window.scrollY, regions } } }, '');
}
export function navigate(path: string, replace = false) {
  rememberPosition();
  const next: NavigationEntry = { index: (entry()?.index ?? 0) + (replace ? 0 : 1), position: emptyPosition() };
  history[replace ? 'replaceState' : 'pushState']({ [stateKey]: next }, '', path);
}
export function returnToPrevious(): boolean {
  rememberPosition();
  if ((entry()?.index ?? 0) === 0) return false;
  history.back();
  return true;
}
export function restorePosition() {
  const position = entry()?.position ?? emptyPosition();
  document.querySelectorAll<HTMLElement>('[data-scroll-key]').forEach(node => {
    node.scrollTop = position.regions[node.dataset.scrollKey!] ?? 0;
  });
  window.scrollTo(0, position.windowY);
}
