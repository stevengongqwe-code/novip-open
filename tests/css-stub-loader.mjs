// 测试用 loader：把 .css 导入 stub 为空模块（jsdom 下不需要真实样式）
export async function resolve(specifier, context, next) {
  if (specifier.endsWith('.css')) return { url: 'css-stub:' + specifier, shortCircuit: true };
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url.startsWith('css-stub:')) return { format: 'module', source: 'export default {};', shortCircuit: true };
  return next(url, context);
}
