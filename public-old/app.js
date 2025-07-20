const { html } = window["apprun"];

import home from './home.js';
import agentModal from './components/agent-modal.js';

const Layout = () => html`
  <div>
    <div id="sidebar"></div>
    <div id="main"></div>
    <div id="agent-modal"></div>
  </div>
`;

// app.render(document.getElementById('app'), Layout)

app.start('#app', {}, Layout);
home.start('#main');
agentModal.mount('#agent-modal');
