/**
 * Mock implementation of Node.js fs module for testing
 */

class MockFS {
  constructor() {
    this.fileSystem = {};
  }

  existsSync(path) {
    const segments = this.normalizePath(path).split('/').filter(Boolean);
    let current = this.fileSystem;

    for (const segment of segments) {
      if (!(segment in current)) {
        return false;
      }
      current = current[segment];
    }
    return true;
  }

  mkdirSync(path, options) {
    const segments = this.normalizePath(path).split('/').filter(Boolean);
    let current = this.fileSystem;

    for (const segment of segments) {
      if (!(segment in current)) {
        current[segment] = {};
      }
      current = current[segment];
    }
  }

  readFileSync(path, encoding) {
    const segments = this.normalizePath(path).split('/').filter(Boolean);
    let current = this.fileSystem;

    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      if (!(segment in current)) {
        throw new Error(`ENOENT: no such file or directory, open '${path}'`);
      }
      current = current[segment];
    }

    const fileName = segments[segments.length - 1];
    if (!(fileName in current) || typeof current[fileName] !== 'string') {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }

    return current[fileName];
  }

  writeFileSync(path, data) {
    const segments = this.normalizePath(path).split('/').filter(Boolean);
    let current = this.fileSystem;

    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      if (!(segment in current)) {
        current[segment] = {};
      }
      current = current[segment];
    }

    const fileName = segments[segments.length - 1];
    current[fileName] = data;
  }

  readdirSync(path) {
    const segments = this.normalizePath(path).split('/').filter(Boolean);
    let current = this.fileSystem;

    for (const segment of segments) {
      if (!(segment in current)) {
        throw new Error(`ENOENT: no such file or directory, scandir '${path}'`);
      }
      current = current[segment];
    }

    return Object.keys(current);
  }

  statSync(path) {
    const segments = this.normalizePath(path).split('/').filter(Boolean);
    let current = this.fileSystem;

    for (const segment of segments) {
      if (!(segment in current)) {
        throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
      }
      current = current[segment];
    }

    const isDirectory = typeof current === 'object';
    return {
      isDirectory: () => isDirectory,
      isFile: () => !isDirectory
    };
  }

  normalizePath(path) {
    if (path === ':memory:') {
      return 'memory';
    }
    return path.replace(/^\/+/, '').replace(/\/+/g, '/');
  }

  reset() {
    this.fileSystem = {};
  }
}

const mockFS = new MockFS();

module.exports = {
  existsSync: mockFS.existsSync.bind(mockFS),
  mkdirSync: mockFS.mkdirSync.bind(mockFS),
  readFileSync: mockFS.readFileSync.bind(mockFS),
  writeFileSync: mockFS.writeFileSync.bind(mockFS),
  readdirSync: mockFS.readdirSync.bind(mockFS),
  statSync: mockFS.statSync.bind(mockFS),
  reset: mockFS.reset.bind(mockFS)
};
