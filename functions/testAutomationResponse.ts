import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  console.log('[TEST] Automation response format test starting');
  
  // Return the EXACT format Base44 automation runner expects
  return Response.json({
    level: "info",
    message: "Test automation response",
    status: "success",
    data: {
      test: true
    }
  });
});