import app from 'apprun';
import Layout from './components/Layout';
import Home from './pages/Home';
import Agent from './pages/Agent';
import World from './pages/World';
import Settings from './pages/Settings';

import 'doodle.css/doodle.css';
import './styles.css';

app.render('#root', <Layout />);

const element = '#pages';
new Home().start(element);
new Agent().mount(element);
new World().mount(element);
new Settings().mount(element);
