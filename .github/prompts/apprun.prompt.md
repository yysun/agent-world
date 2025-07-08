# AppRun Framework Rules

## Core Concepts
- **HTML templates**: Use `html` tagged literals for UI
- **State management**: through event handlers returning new state
- **Event handling**: Use `@event-name` in templates, handlers take `(state, param) => newState`
- **Local events**: Using `run()` - don't need to be registered in the update object

## Component Patterns

### Functional Components (No state needed)
```js
// Pure function component - takes props, returns HTML template
export const AgentModal = (agent, close) => {
  return html`
    <div class="modal-overlay" @click=${run(close, false)}>
      <div class="modal-content" @click=${(e) => e.stopPropagation()}>
        <!-- Template content with conditional rendering -->
        ${agent.status ? html`<h2>${agent.name}</h2>` : html`
          <input value="${agent.name || ''}" @input=${(e) => agent.name = e.target.value}>
        `}
      </div>
    </div>
  `;
};
```

### Full Page Components (With state/lifecycle)
```js
// Async state initialization with API calls
const state = async () => {
  const data = await api.getData();
  return { ...initialState, data };
};

// Event handlers defined as separate functions
const selectWorld = async (state, worldName) => {
  if (worldName === state.worldName) return state;
  const agents = await api.getAgents(worldName);
  return ({ ...state, worldName, agents });
};

const openModal = (state, item = null) => {
  return ({
    ...state,
    editingItem: item || { name: 'New Item' },
    showModal: true
  });
};

// View function with conditional rendering and loops
const view = (state) => {
  return html`
    <div class="container">
      ${state.items.map(item => html`
        <div class="item" @click=${run(openModal, item)}>
          ${item.name}
        </div>
      `)}
      ${state.showModal ? ModalComponent(state.editingItem, closeModal) : ''}
    </div>
  `;
};

// Minimal update object for routing
const update = {
  '/,#': state => state
};

// Exporting the component instance with global event handling
export default new Component(state, view, update, {global_event: true});
```

## Event Handling Patterns

### Local Events with run()
```js
// Simple event with parameter
@click=${run(selectWorld, world.name)}

// Event with callback function
@click=${run(closeModal, false)}
```

- DO NOT use `@click=${() => run(<event_name>)}` - this will not trigger re-rendering.

- DO NOT use `@click=${(e) => ... run(<event_name>, e)}` - this will not pass the event correctly. Event parameter will be automatically injected:

```js
// Injecting event parameter into run()
@input=${run('updateModalAgentName')}

// Event handler function gets the event as the last parameter
const updateModalAgentName = (state, e) => {
  const name = e.target.value;
  return ({...state,  agentName: name });
};
```

```js
// Using run() directly
@click=${run(openAgentModal, null)}

// call e.stopPropagation() in the handler
const openAgentModal = (state, agent, e) => {
  e.stopPropagation();
  return ({...state,  editingAgent: agent, showModal: true });
};
```


### Conditional Rendering
```js
// Ternary operator for simple conditions
${state.loading ? html`<div>Loading...</div>` : ''}

// Complex conditional with nested HTML
${agent.status ? html`
  <h2>${agent.name}</h2>
` : html`
  <input value="${agent.name || ''}" @input=${...}>
`}

// Array mapping with conditional content
${state.items.map(item => html`
  <div class="${item.active ? 'active' : ''}">${item.name}</div>
`)}
```

### State Management Patterns
```js
// Immutable state updates
return ({ ...state, newProperty: value });

// Async state updates
const handler = async (state, param) => {
  const data = await api.call(param);
  return ({ ...state, data });
};

// Async state updates using generators
const handler = async function* (state, param) {
  yield { loading: true };
  const data = await api.call(param);
  return ({ ...state, data });
};

// Error handling in state updates
try {
  if (save) api.saveData(state.data);
  return ({ ...state, showModal: false });
} catch (error) {
  return ({ ...state, error });
}
```

## Key Rules
- **Functional components**: Export pure functions that take props and return HTML
- **Page components**: Use async state initialization, separate event handlers, and Component class
- **Event handlers must return new state** for re-render (no return = no re-render)
- **View functions are pure** - render only, don't mutate state
- **Use `run()` for local events**, `app.run()` for global events
- **Immutable state updates** - always spread existing state
- **Conditional rendering** with ternary operators and template literals
- **Component composition** - pass props and callbacks to child components

