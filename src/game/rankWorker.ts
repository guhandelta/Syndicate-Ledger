import { answerRequest, type RankReply, type RankRequest } from './rankClient';

// the worker scope: only what this file needs of it
const scope = self as unknown as { onmessage: ((e: { data: RankRequest }) => void) | null; postMessage(m: RankReply): void };
scope.onmessage = (e) => scope.postMessage(answerRequest(e.data));
