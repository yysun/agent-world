# Vitest Mock Hoisting Patterns

**Purpose:** Document conversion patterns from Jest to Vitest for stateful mocks  
**Date:** 2025-10-29

## Critical Difference: Mock Hoisting

**Jest:** Auto-hoists all `jest.mock()` calls before any other code  
**Vitest:** Does NOT auto-hoist - requires explicit `vi.hoisted()` for stateful patterns

## Pattern 1: Stateful Counter (nanoid)

### Jest Pattern (setup.ts line 220)
```typescript
// ❌ This won't work in Vitest - nanoidCounter not hoisted
let nanoidCounter = 0;
jest.mock('nanoid', () => ({
  nanoid: jest.fn<any>().mockImplementation((size?: number) => {
    nanoidCounter++;  // ReferenceError in Vitest!
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    return `mock-id-${timestamp}-${random}-${nanoidCounter}`.substring(0, size || 21);
  })
}));
```

### Vitest Pattern (REQUIRED)
```typescript
// ✅ Use vi.hoisted() to create closure
const { incrementNanoidCounter, getNanoidId } = vi.hoisted(() => {
  let counter = 0;
  return {
    incrementNanoidCounter: () => ++counter,
    getNanoidId: (size?: number) => {
      const counter = incrementNanoidCounter();
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 10000);
      return `mock-id-${timestamp}-${random}-${counter}`.substring(0, size || 21);
    }
  };
});

vi.mock('nanoid', () => ({
  nanoid: vi.fn<any>().mockImplementation((size?: number) => getNanoidId(size))
}));
```

### Alternative: Use crypto.randomUUID (Recommended)
```typescript
// ✅ Simpler - no stateful counter needed
vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => `test-uuid-${Date.now()}-${Math.random()}`)
});

// Remove nanoid mock entirely - crypto is already mocked
```

**Decision:** Use crypto.randomUUID approach (already in setup.ts line 21-23)

---

## Pattern 2: Shared Storage Instance (setup.ts line 86)

### Jest Pattern
```typescript
// ❌ Won't work in Vitest - sharedStorage not hoisted
jest.mock('../../core/storage/storage-factory', () => {
  const actualModule = jest.requireActual('../../core/storage/storage-factory') as any;
  const { MemoryStorage } = jest.requireActual('../../core/storage/memory-storage') as any;
  
  let sharedStorage: any = new MemoryStorage();  // Not hoisted!
  
  return {
    ...actualModule,
    createStorageWrappers: jest.fn<any>().mockImplementation(() => sharedStorage),
    __testUtils: {
      clearStorage: () => { sharedStorage = new MemoryStorage(); }
    }
  };
});
```

### Vitest Pattern (REQUIRED)
```typescript
// ✅ Hoist the storage getter/setter
const { getSharedStorage, clearSharedStorage } = vi.hoisted(() => {
  let storage: any = null;
  
  return {
    getSharedStorage: () => {
      if (!storage) {
        // Lazy initialization - MemoryStorage not yet imported during hoisting
        const { MemoryStorage } = require('./core/storage/memory-storage');
        storage = new MemoryStorage();
      }
      return storage;
    },
    clearSharedStorage: () => {
      const { MemoryStorage } = require('./core/storage/memory-storage');
      storage = new MemoryStorage();
    }
  };
});

vi.mock('./core/storage/storage-factory', async () => {
  const actualModule = await vi.importActual('./core/storage/storage-factory') as any;
  
  return {
    ...actualModule,
    createStorageWrappers: vi.fn(() => getSharedStorage()),
    createStorageWithWrappers: vi.fn(async () => getSharedStorage()),
    getStorageWrappers: vi.fn(async () => getSharedStorage()),
    setStoragePath: vi.fn().mockResolvedValue(undefined),
    __testUtils: {
      clearStorage: clearSharedStorage,
      getStorage: getSharedStorage
    }
  };
});
```

**Key Points:**
- Use lazy initialization in hoisted function
- `require()` inside hoisted functions (not `import`)
- `vi.importActual()` is async (use `await`)
- Return factory functions, not instances

---

## Pattern 3: Module Path Resolution

### Jest Pattern
```typescript
jest.mock('../../core/storage/storage-factory', () => { /* ... */ });
```

### Vitest Pattern (Relative paths work)
```typescript
// ✅ Relative paths work from setup file
vi.mock('./core/storage/storage-factory', () => { /* ... */ });

// Note: Path is relative to vitest-setup.ts location (tests/)
// Jest used ../../core, Vitest uses ./core (one less level)
```

**Path Resolution Rules:**
- Mock paths are relative to setup file location
- Setup file is at `tests/vitest-setup.ts`
- Core modules are at `core/`
- Therefore: `./core/module` not `../../core/module`

---

## Pattern 4: Dynamic Imports (requireActual → importActual)

### Jest Pattern
```typescript
const actualModule = jest.requireActual('../../core/module') as any;
```

### Vitest Pattern
```typescript
// ✅ Use await with vi.importActual
const actualModule = await vi.importActual('./core/module') as any;
```

**Important:** Mock callback must be `async` to use `await`

---

## Pattern 5: Mock Function Chaining

### Jest Pattern
```typescript
jest.fn<any>().mockReturnValue('value')
jest.fn<any>().mockResolvedValue('value')
jest.fn<any>().mockImplementation(() => { /* ... */ })
```

### Vitest Pattern (Same API!)
```typescript
vi.fn<any>().mockReturnValue('value')
vi.fn<any>().mockResolvedValue('value')
vi.fn<any>().mockImplementation(() => { /* ... */ })
```

**No changes needed** - API is compatible

---

## Pattern 6: Global Mocks (crypto, performance, process)

### Jest Pattern
```typescript
const mockCrypto = { randomUUID: jest.fn<any>().mockReturnValue('mock-uuid') };
global.crypto = mockCrypto as any;
```

### Vitest Pattern (Same!)
```typescript
const mockCrypto = { randomUUID: vi.fn<any>().mockReturnValue('mock-uuid') };
global.crypto = mockCrypto as any;

// Or use vi.stubGlobal (cleaner)
vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => 'mock-uuid')
});
```

---

## Summary: Conversion Checklist

For `tests/core/setup.ts` → `tests/vitest-setup.ts`:

- [ ] Replace all `jest` with `vi` in imports: `import { vi } from 'vitest'`
- [ ] Replace `jest.fn` → `vi.fn` (global replace)
- [ ] Replace `jest.mock` → `vi.mock` (global replace)
- [ ] Replace `jest.spyOn` → `vi.spyOn` (global replace)
- [ ] Replace `jest.requireActual` → `await vi.importActual` (make callback async)
- [ ] Identify stateful patterns (counters, shared instances)
- [ ] Wrap stateful patterns in `vi.hoisted()`
- [ ] Use lazy initialization for imports inside hoisted functions
- [ ] Update mock paths (../../core → ./core)
- [ ] Test with storage test to verify shared instance works

## Risk Areas

**High Risk:**
1. `sharedStorage` pattern (line 86) - shared state across tests
2. `nanoidCounter` pattern (line 220) - stateful counter

**Medium Risk:**
3. Path resolution in workspace setup
4. Async importActual in all mocks

**Low Risk:**
5. Simple fn() replacements (API compatible)
6. Global mocks (same pattern)

## Testing Strategy

1. Convert setup.ts with hoisting patterns
2. Test with `tests/core/storage/getMemory-integration.test.ts` (uses shared storage)
3. If shared storage fails, debug hoisting pattern
4. Once storage works, batch convert other files
