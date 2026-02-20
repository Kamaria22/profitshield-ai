import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Loader2, Play } from 'lucide-react';
import { downloadViaProxy } from './download';
import { base44 } from '@/api/base44Client';

const VARIANTS = ['1080p', '720p', 'shopify', 'thumb'];

export default function DownloadSelfTest({ jobId }) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);

  const runTest = async () => {
    setRunning(true);
    setResults(null);

    const testResults = {
      timestamp: new Date().toISOString(),
      jobId,
      variants: {},
      summary: { pass: 0, fail: 0 }
    };

    try {
      // 1. Verify job exists and has outputs
      console.log('[SelfTest] Step 1: Fetch job status');
      const statusResp = await base44.functions.invoke('demoVideoGetStatus', { jobId });
      
      if (!statusResp.data?.ok) {
        testResults.jobStatus = { pass: false, error: 'Job not found or failed' };
        setResults(testResults);
        setRunning(false);
        return;
      }

      const outputs = statusResp.data.outputs || {};
      testResults.jobStatus = { 
        pass: true, 
        status: statusResp.data.status,
        outputKeys: Object.keys(outputs)
      };

      // 2. Test each variant
      for (const variant of VARIANTS) {
        console.log(`[SelfTest] Testing variant: ${variant}`);
        
        const filename = `test-${variant}-${Date.now()}.${variant === 'thumb' ? 'jpg' : 'mp4'}`;
        
        try {
          const proof = await downloadViaProxy({ 
            jobId, 
            variant, 
            filename,
            dryRun: true // Don't actually trigger download
          });

          const isVideo = variant !== 'thumb';
          const minSize = isVideo ? 1_500_000 : 10_000;
          
          const checks = {
            proofOk: proof.ok,
            hasBytes: proof.bytes > 0,
            meetsMinSize: proof.bytes >= minSize,
            correctType: isVideo ? proof.type?.includes('video/mp4') : proof.type?.includes('image'),
            error: proof.error
          };

          const allPass = checks.proofOk && checks.hasBytes && checks.meetsMinSize && checks.correctType;

          testResults.variants[variant] = {
            pass: allPass,
            bytes: proof.bytes,
            type: proof.type,
            checks
          };

          if (allPass) {
            testResults.summary.pass++;
          } else {
            testResults.summary.fail++;
          }

        } catch (err) {
          testResults.variants[variant] = {
            pass: false,
            error: err.message
          };
          testResults.summary.fail++;
        }

        // Small delay between tests
        await new Promise(r => setTimeout(r, 500));
      }

    } catch (err) {
      testResults.error = err.message;
    }

    setResults(testResults);
    setRunning(false);
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Download Self-Test</h3>
        <Button 
          onClick={runTest} 
          disabled={running || !jobId}
          size="sm"
          variant="outline"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
          {running ? 'Testing...' : 'Run Test'}
        </Button>
      </div>

      {results && (
        <div className="space-y-3">
          {/* Summary */}
          <div className="flex items-center gap-2 p-3 bg-slate-50 rounded">
            <Badge variant={results.summary.pass === VARIANTS.length ? 'default' : 'destructive'}>
              {results.summary.pass}/{VARIANTS.length} passed
            </Badge>
            <span className="text-xs text-slate-500">{results.timestamp}</span>
          </div>

          {/* Job Status */}
          {results.jobStatus && (
            <div className="p-3 border rounded">
              <div className="flex items-center gap-2 mb-2">
                {results.jobStatus.pass ? (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-600" />
                )}
                <span className="font-medium text-sm">Job Status</span>
              </div>
              <div className="text-xs text-slate-600 space-y-1">
                <div>Status: {results.jobStatus.status}</div>
                <div>Output Keys: {results.jobStatus.outputKeys?.join(', ') || 'none'}</div>
              </div>
            </div>
          )}

          {/* Variant Results */}
          {Object.entries(results.variants).map(([variant, result]) => (
            <div key={variant} className="p-3 border rounded">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {result.pass ? (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-600" />
                  )}
                  <span className="font-medium text-sm">{variant}</span>
                </div>
                {result.bytes > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {(result.bytes / 1_000_000).toFixed(2)} MB
                  </Badge>
                )}
              </div>

              {result.checks && (
                <div className="text-xs space-y-1">
                  <div className={result.checks.proofOk ? 'text-green-600' : 'text-red-600'}>
                    • Proof OK: {result.checks.proofOk ? '✓' : '✗'}
                  </div>
                  <div className={result.checks.meetsMinSize ? 'text-green-600' : 'text-red-600'}>
                    • Min Size: {result.checks.meetsMinSize ? '✓' : '✗'}
                  </div>
                  <div className={result.checks.correctType ? 'text-green-600' : 'text-red-600'}>
                    • Type: {result.type || 'unknown'}
                  </div>
                </div>
              )}

              {result.error && (
                <div className="text-xs text-red-600 mt-2">
                  Error: {result.error}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!jobId && (
        <div className="text-sm text-slate-500 text-center py-4">
          Generate a video first to run tests
        </div>
      )}
    </Card>
  );
}