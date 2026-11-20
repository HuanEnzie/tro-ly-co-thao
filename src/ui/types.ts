import { Report } from '../engine/checker';
import { Change } from '../engine/fixer';
import { Issue } from '../engine/types';

/** một file Word đã nạp và soát trong phiên làm việc */
export interface Item {
  id: string;
  name: string;
  data: ArrayBuffer;
  hash: string;
  report: Report;
  ai?: { issues: Issue[]; dropped: number; model: string };
  aiBusy?: boolean;
  aiError?: string;
  fixed?: { url: string; name: string; changes: Change[] };
}

export interface Quota { ready: boolean; used: number; limit: number; passcode: boolean }
