export const ORIGIN = 'https://thecontenders.co';
export const slugFor = (route) => route.replace(/^\//, '').replace(/\//g, '__') || 'index';
export const outFor = (route) => (route === '/' ? 'index.html' : route.replace(/^\//, '') + '/index.html');
