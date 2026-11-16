import '../src/ui/styles.css';
import { mount } from 'svelte';
import App from '../src/ui/App.svelte';
import { Session } from '../src/ui/session.svelte';
import { timelineBook, timelineCase } from './timeline-case';

// the end-to-end tests read the answers from here
(window as unknown as { __book: unknown }).__book = timelineBook;
const session = new Session(timelineCase, timelineBook, null);
if (location.hash) session.applyRoute(location.hash);
mount(App, { target: document.getElementById('app')!, props: { session } });
