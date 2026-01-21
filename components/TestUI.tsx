import React, { useEffect, useState } from 'react';
import { TestRunner } from '../engine/TestRunner';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

export const TestUI: React.FC = () => {
  const [results, setResults] = useState<TestResult[]>([]);
  const [done, setDone] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (running) return;
    setRunning(true);
    const runner = new TestRunner((r, d) => {
      setResults([...r]);
      setDone(d);
    });
    runner.runAll();
  }, [running]);

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  const totalTime = results.reduce((a, r) => a + r.duration, 0);

  return (
    <div className="fixed inset-0 z-[200] bg-black text-white p-6 overflow-auto font-mono text-sm">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">E2E Test Runner</h1>
        <div className="mb-4 flex gap-4 items-center">
          <span className={`px-3 py-1 rounded ${done ? 'bg-green-800' : 'bg-yellow-800'}`}>
            {done ? 'COMPLETE' : 'RUNNING...'}
          </span>
          <span className="text-green-400">{passed} passed</span>
          <span className="text-red-400">{failed} failed</span>
          <span className="text-gray-400">{total} total</span>
          <span className="text-gray-500">{totalTime.toFixed(0)}ms</span>
        </div>

        <div className="space-y-1">
          {results.map((r, i) => (
            <div key={i} className={`flex items-start gap-2 py-1 px-2 rounded ${r.passed ? 'bg-green-900/30' : 'bg-red-900/30'}`}>
              <span className={`font-bold ${r.passed ? 'text-green-400' : 'text-red-400'}`}>
                {r.passed ? 'PASS' : 'FAIL'}
              </span>
              <span className="flex-1">{r.name}</span>
              <span className="text-gray-500">{r.duration.toFixed(1)}ms</span>
              {r.error && <span className="text-red-300 text-xs ml-2">{r.error}</span>}
            </div>
          ))}
        </div>

        {done && (
          <div className={`mt-6 p-4 rounded text-lg font-bold ${failed === 0 ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
            {failed === 0 ? 'ALL TESTS PASSED' : `${failed} TESTS FAILED`}
          </div>
        )}
      </div>
    </div>
  );
};
