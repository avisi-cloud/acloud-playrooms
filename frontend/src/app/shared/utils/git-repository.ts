/** One `--git` entry split into its parts, the way acloud splits it. */
export interface GitRepository {
  url: string;
  /** Branch, tag or commit; empty clones the default branch. */
  ref: string;
  /** The folder under ~/workspace acloud clones into. */
  directory: string;
}

/** The forwarded tokens acloud tries for every clone, in its own order; the first one forwarded wins. */
export const GIT_CLONE_TOKENS = ['GITLAB_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN'] as const;
export type GitCloneToken = (typeof GIT_CLONE_TOKENS)[number];

export const RECENT_GIT_REPOSITORY_LIMIT = 10;

/** Matches acloud's URL[@REF] parsing: the last '@' after '://' starts the ref, because acloud forbids credentials in the URL. */
export function parseGitRepository(entry: string): GitRepository {
  const raw = entry.trim();
  const schemeEnd = raw.indexOf('://');
  const refStart = raw.lastIndexOf('@');
  const hasRef = schemeEnd > 0 && refStart > schemeEnd;
  const url = hasRef ? raw.slice(0, refStart) : raw;
  return {
    url,
    ref: hasRef ? raw.slice(refStart + 1) : '',
    directory: directoryOfRepositoryUrl(url),
  };
}

/** Why acloud would not clone this entry, in one line; empty when it would (or the row is blank). */
export function gitRepositoryProblem(entry: string): string {
  const raw = entry.trim();
  if (!raw) return '';
  const schemeEnd = raw.indexOf('://');
  const scheme = schemeEnd > 0 ? raw.slice(0, schemeEnd).toLowerCase() : '';
  if (scheme === 'ssh' || (!scheme && raw.includes('@'))) {
    return 'acloud skips SSH remotes. Use the HTTPS URL, or clone it after connecting.';
  }
  if (scheme !== 'https') return 'Use an https:// URL.';
  if (hasCredentialsInUrl(raw)) {
    return 'Remove the user name from the URL and forward a token under Environment variables.';
  }
  const repository = parseGitRepository(raw);
  const { host, path } = hostAndPathOfUrl(repository.url);
  if (!host || !path || !repository.directory) {
    return 'Add the repository path, such as https://host/group/repo.git.';
  }
  return '';
}

/** A hint, never a block: a public repository clones without a token, and only the host says which token a private one needs. */
export function gitTokenHint(entry: string, environmentVariables: string[]): string {
  if (!entry.trim() || gitRepositoryProblem(entry)) return '';
  const neededTokens = tokensAcceptedByHost(hostAndPathOfUrl(parseGitRepository(entry).url).host);
  if (!neededTokens.length) return '';
  const cloneToken = tokenAcloudClonesWith(environmentVariables);
  if (cloneToken && neededTokens.includes(cloneToken)) return '';
  if (cloneToken) {
    return `If this repository is private: acloud clones with ${cloneToken}, not ${neededTokens[0]}.`;
  }
  return `If this repository is private, forward ${neededTokens[0]} under Environment variables.`;
}

/** The first forwarded clone token, as acloud picks it; KEY and KEY=VALUE both forward KEY. */
export function tokenAcloudClonesWith(environmentVariables: string[]): GitCloneToken | undefined {
  const forwardedKeys = environmentVariables.map((entry) => entry.split('=')[0].trim());
  return GIT_CLONE_TOKENS.find((token) => forwardedKeys.includes(token));
}

/** The URL without its ref and without any user name or password, for remembering. */
export function gitRepositoryUrlWithoutCredentials(entry: string): string {
  return parseGitRepository(
    entry.trim().replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/]*@(?=[^/]*\/)/i, '$1'),
  ).url;
}

/** Newest first, without duplicates, at most ten; entries acloud would not clone are left out. */
export function rememberRecentGitRepositories(recent: string[], used: string[]): string[] {
  const usedUrls = used
    .map(gitRepositoryUrlWithoutCredentials)
    .filter((url) => url && !gitRepositoryProblem(url));
  return [...new Set([...usedUrls, ...recent])].slice(0, RECENT_GIT_REPOSITORY_LIMIT);
}

function tokensAcceptedByHost(host: string): GitCloneToken[] {
  const lowerHost = host.toLowerCase();
  if (lowerHost === 'github.com') return ['GITHUB_TOKEN', 'GH_TOKEN'];
  if (lowerHost.includes('gitlab')) return ['GITLAB_TOKEN'];
  return [];
}

function hasCredentialsInUrl(raw: string): boolean {
  const afterScheme = raw.slice(raw.indexOf('://') + 3);
  const pathStart = afterScheme.indexOf('/');
  return pathStart >= 0 && afterScheme.slice(0, pathStart).includes('@');
}

function hostAndPathOfUrl(url: string): { host: string; path: string } {
  const afterScheme = url.slice(url.indexOf('://') + 3);
  const pathStart = afterScheme.indexOf('/');
  if (pathStart < 0) return { host: afterScheme, path: '' };
  return {
    host: afterScheme.slice(0, pathStart),
    path: afterScheme.slice(pathStart + 1).replace(/\/+$/, ''),
  };
}

// acloud's clone folder: the last path segment, without trailing slashes or ".git".
function directoryOfRepositoryUrl(url: string): string {
  const trimmed = url.replace(/\/+$/, '');
  return trimmed.slice(trimmed.lastIndexOf('/') + 1).replace(/\.git$/, '');
}
