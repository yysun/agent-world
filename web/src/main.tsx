import app from 'apprun';
import Layout from './Layout';
import Home from './Home';
import About from './About';
import Contact from './Contact';

import './styles.css';

app.render('#root', <Layout />);

const element = '#pages';
new Home().start(element);
new About().mount(element);
new Contact().mount(element);