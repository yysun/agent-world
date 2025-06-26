import home from './home.js';

const Layout = () => html`
  <div>
    <div id="sidebar"></div>
    <div id="main"></div>
  </div>
`;

// app.render(document.getElementById('app'), Layout)

app.start('#app', {}, Layout);
home.start('#main');
