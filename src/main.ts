import './ui/styles.css';
import { mount } from 'svelte';
import caseFile from '../cases/case-01-harbor-ledger.json';
import puzzles from '../cases/case-01-harbor-ledger/puzzles.json';
import town from '../cases/case-01-harbor-ledger/town.json';
import type { CaseFile, PuzzleBook } from './game/caseTypes';
import App from './ui/App.svelte';
import type { Town } from './town/townTypes';
import { Session } from './ui/session.svelte';

const session = new Session(caseFile as unknown as CaseFile, puzzles as unknown as PuzzleBook, town as unknown as Town);
// open the screen in the address bar (reload, shared link), if the game allows it
if (location.hash) session.applyRoute(location.hash);
mount(App, { target: document.getElementById('app')!, props: { session } });
