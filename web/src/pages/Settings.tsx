import { app, Component } from 'apprun';
import { SettingsPageView } from '../features/settings';

export default class extends Component {
  override state = 'Settings';

  override view = (state: any) => <SettingsPageView title={state} />;

  override update = {
    '/Settings': (state: any) => state,
  };
}

