# AppRun Framework Rules for Frontend Development

## Simplified Rules for Using AppRun
- **HTML templates**: user interfaces.
- **Functional components**: when no state or lifecycle methods are needed.
- **Class-based components**: when need state or lifecycle methods.
- **Event handling**: use `@event-name` to call event handlers.
- **Event Handlers**: 
  - Takes a `state` and `param` to return a new state.
  - Handles side effects
  - Must return new state to trigger re-render
  - No return = no re-render
  ```js
  <button @click=${run(**EventHandler**, param)}></button>
  ```
  ```js
  const eventName = (state, param) => newState // event handler
  ```
  
## Component Structure
1. Functional component
  - Use `props` for data passed from parent.
  - No state or lifecycle methods needed.
  ```js
  const MyComponent = (props) => {
    return html`<p>Component content</p>`;
  };
  export default MyComponent; // if in module file
  ```
  
2. Class-based component in module file
  - define state with a value or an (async) function
  - define view - don't change the state
  - use `update` to subscribe to global events only
  - export the component instance
  ```js
  // const state = 0; // initial state with a value
  const state = async () => await fetch('/api/data');
  const view = () => html`<p>Component content</p>`;
  export default new Component(state, view);
  ```

## Global Event Handling
- prefix with event name: `#eventName` or `@eventName`
- use `app.run` to publish events
  ```js
  document.addEventListener('click', (e) => {
    app.run('@document-click', e);
  });
  ```
- use `app.on` to subscribe - when no component refresh
  ```js
  app.on('@document-click', (state, e) => {
    console.log('Document clicked:', e);
  });
  ```
- use `update` of class component to subscribe - auto component refresh
  ```js
  const state = 0;
  const view = () => html``;
  const update = {
    '@document-click': (state, e) => {
      console.log('Document clicked:', e);
    }
  };
  export default new Component(state, view, update);
  ```
