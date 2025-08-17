import { app, Component } from 'apprun';

export default class extends Component {
  override state = 'About';

  override view = (state: any) => <div>
    <h1>{state}</h1>
  </div>;

  override update = {
    '/About': (state: any) => state,
  };
}

