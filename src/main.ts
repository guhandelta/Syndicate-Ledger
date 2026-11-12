import './ui/styles.css';
import caseFile from '../cases/case-01-harbor-ledger.json';
import puzzles from '../cases/case-01-harbor-ledger/puzzles.json';
import type { CaseFile, PuzzleBook } from './game/caseTypes';
import { mountApp } from './ui/app';

mountApp(document.getElementById('app')!, caseFile as unknown as CaseFile, puzzles as unknown as PuzzleBook);
