import { app, Component } from 'apprun';

export default class WorldComponent extends Component {
  state = 'World';

  view = state => <div>
    <h1>{state}</h1>
  </div>;

  update = {
    '/World': (state, name) => {
      if (name) {
        name = decodeURIComponent(name);
        return `${name}`;
      } else {
        return 'New World';
      }
    }
  };
}

