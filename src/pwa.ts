// Local dev stays unaffected. Registration is best-effort and must not block login.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
      console.warn('앱 설치 지원을 준비하지 못했어요. 웹 기능은 계속 사용할 수 있습니다.');
    });
  }, { once: true });
}
