import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GitPullRequest, ExternalLink, RefreshCw, User, Calendar, MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function GitHubPullRequests() {
  const [org, setOrg] = useState('');
  const [repo, setRepo] = useState('');
  const [query, setQuery] = useState({ org: '', repo: '' });

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['github-prs', query],
    queryFn: async () => {
      const res = await base44.functions.invoke('githubPullRequests', query);
      return res.data;
    },
  });

  const pulls = data?.pulls || [];

  const handleSearch = (e) => {
    e.preventDefault();
    setQuery({ org, repo });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center">
          <GitPullRequest className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Open Pull Requests</h1>
          <p className="text-slate-400 text-sm">Review open PRs from GitHub</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto text-slate-400 hover:text-white"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Filter */}
      <form onSubmit={handleSearch} className="flex gap-3 flex-wrap">
        <Input
          placeholder="Organization (optional)"
          value={org}
          onChange={(e) => setOrg(e.target.value)}
          className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 w-52"
        />
        <Input
          placeholder="Repository (optional)"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 w-52"
        />
        <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700">
          Search
        </Button>
        {(query.org || query.repo) && (
          <Button
            type="button"
            variant="ghost"
            className="text-slate-400"
            onClick={() => { setOrg(''); setRepo(''); setQuery({ org: '', repo: '' }); }}
          >
            Clear
          </Button>
        )}
      </form>

      {/* Results */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-slate-800/50 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-400">
          {error.message || 'Failed to load pull requests.'}
        </div>
      ) : pulls.length === 0 ? (
        <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-12 text-center">
          <GitPullRequest className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No open pull requests found.</p>
          <p className="text-slate-500 text-sm mt-1">Try specifying an org or repo above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-slate-400 text-sm">{pulls.length} open pull request{pulls.length !== 1 ? 's' : ''}</p>
          {pulls.map((pr) => (
            <Card key={pr.id} className="bg-slate-800/60 border-slate-700 hover:border-slate-500 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <GitPullRequest className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <a
                        href={pr.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-white hover:text-indigo-300 transition-colors flex items-center gap-1"
                      >
                        {pr.title}
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                      </a>
                      <Badge className="bg-green-500/15 text-green-400 border-green-500/30 text-xs">open</Badge>
                    </div>
                    <p className="text-slate-400 text-xs mt-1 truncate">
                      {pr.repository_url
                        ? pr.repository_url.replace('https://api.github.com/repos/', '')
                        : pr.base?.repo?.full_name || ''}
                      {pr.number ? ` #${pr.number}` : ''}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 flex-wrap">
                      {pr.user && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {pr.user.login}
                        </span>
                      )}
                      {pr.created_at && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDistanceToNow(new Date(pr.created_at), { addSuffix: true })}
                        </span>
                      )}
                      {pr.comments > 0 && (
                        <span className="flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />
                          {pr.comments} comment{pr.comments !== 1 ? 's' : ''}
                        </span>
                      )}
                      {pr.labels?.length > 0 && pr.labels.map((label) => (
                        <span
                          key={label.id}
                          className="px-1.5 py-0.5 rounded text-xs"
                          style={{
                            background: `#${label.color}22`,
                            color: `#${label.color}`,
                            border: `1px solid #${label.color}44`,
                          }}
                        >
                          {label.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}