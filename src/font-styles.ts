// Handwriting faces are needed by the generator, not the tool directory.
let pending: Promise<void> | undefined;
export function ensureHandwritingStyles(): Promise<void> {
  if (pending) return pending;
  pending = new Promise<void>((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/fonts/fonts-v4.css';
    link.onload = () => resolve();
    link.onerror = () => {
      link.remove();
      pending = undefined;
      reject(new Error('手写字库样式加载失败，请检查网络后重试。'));
    };
    document.head.append(link);
  });
  return pending;
}
