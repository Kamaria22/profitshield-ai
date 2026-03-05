import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('github');

    // Get authenticated user's repos or org repos
    const { org, repo } = await req.json().catch(() => ({}));

    let pullsUrl;
    if (org && repo) {
      pullsUrl = `https://api.github.com/repos/${org}/${repo}/pulls?state=open&per_page=50`;
    } else if (org) {
      // List open PRs across all repos in an org
      pullsUrl = `https://api.github.com/search/issues?q=is:pr+is:open+org:${org}&per_page=50`;
    } else {
      // List all open PRs assigned to/requested for the authenticated user
      pullsUrl = `https://api.github.com/search/issues?q=is:pr+is:open+review-requested:@me&per_page=50`;
    }

    const response = await fetch(pullsUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      const err = await response.text();
      return Response.json({ error: err }, { status: response.status });
    }

    const data = await response.json();

    // Normalize search results vs direct pulls endpoint
    const pulls = data.items || data;

    return Response.json({ pulls });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});