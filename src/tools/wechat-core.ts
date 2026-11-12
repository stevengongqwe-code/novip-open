/**
 * 微信内置浏览器与移动端环境检测辅助函数
 * 纯函数与安全兼容：Node.js、JSDOM 与浏览器均可安全调用
 */

export function isWeChat(ua?: string): boolean {
  if (typeof window !== 'undefined' && window.location?.search?.includes('wechat=1')) {
    return true;
  }
  const agent = ua ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  return /MicroMessenger/i.test(agent);
}

export function isIOS(ua?: string): boolean {
  const agent = ua ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  return /iPad|iPhone|iPod/i.test(agent);
}

export function isMobileDevice(ua?: string): boolean {
  const agent = ua ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  return /Android|iPhone|iPad|iPod|Mobile/i.test(agent);
}
