import { app, Component } from 'apprun';

export default class SettingsComponent extends Component {
  state = 'Settings';

  view = state => <div>
    <h1>{state}</h1>
  </div>;

  update = {
    '/Settings': state => state,
  };
}

