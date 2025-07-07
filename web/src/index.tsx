import { app, Component } from 'apprun';
export default class HomeComponent extends Component {
  state = 'Home';

  view = state => <div>
    <h2>{state}</h2>
    <p>This is an AppRun Component</p>
  </div>;
}

