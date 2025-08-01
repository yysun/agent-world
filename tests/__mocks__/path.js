/**
 * Mock implementation of Node.js path module for testing
 */

function join(...paths) {
  return paths
    .filter(Boolean)
    .join('/')
    .replace(/\/+/g, '/');
}

function dirname(path) {
  const parts = path.split('/');
  if (parts.length <= 1) {
    return '.';
  }
  return parts.slice(0, -1).join('/') || '/';
}

function basename(path) {
  const parts = path.split('/');
  return parts[parts.length - 1] || '';
}

function resolve(...paths) {
  let resolved = '';

  for (const path of paths) {
    if (path.startsWith('/')) {
      resolved = path;
    } else {
      resolved = resolved ? join(resolved, path) : path;
    }
  }

  return resolved || '.';
}

function isAbsolute(path) {
  return path.startsWith('/');
}

function extname(path) {
  const basename = path.split('/').pop() || '';
  const lastDot = basename.lastIndexOf('.');
  return lastDot > 0 ? basename.slice(lastDot) : '';
}

const sep = '/';

module.exports = {
  join,
  dirname,
  basename,
  resolve,
  isAbsolute,
  extname,
  sep
};
