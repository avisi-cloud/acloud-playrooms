import {
  gitRepositoryProblem,
  gitRepositoryUrlWithoutCredentials,
  gitTokenHint,
  parseGitRepository,
  rememberRecentGitRepositories,
  tokenAcloudClonesWith,
} from './git-repository';

describe('parseGitRepository', () => {
  it.each([
    [
      'https://gitlab.example.com/grp/repo.git',
      'https://gitlab.example.com/grp/repo.git',
      '',
      'repo',
    ],
    ['https://github.com/org/tool', 'https://github.com/org/tool', '', 'tool'],
    [
      ' https://gitlab.example.com/grp/repo.git@develop ',
      'https://gitlab.example.com/grp/repo.git',
      'develop',
      'repo',
    ],
    ['https://github.com/org/tool/@feature/x', 'https://github.com/org/tool/', 'feature/x', 'tool'],
    // acloud forbids credentials, so like acloud the last '@' is always the ref.
    ['https://user@host.example/grp/repo.git', 'https://user', 'host.example/grp/repo.git', 'user'],
  ])('splits %s the way acloud does', (entry, url, ref, directory) => {
    expect(parseGitRepository(entry)).toEqual({ url, ref, directory });
  });
});

describe('gitRepositoryProblem', () => {
  it.each([
    '',
    '  ',
    'https://gitlab.example.com/grp/repo.git',
    'https://github.com/org/tool@v1.2',
  ])('accepts %j', (entry) => {
    expect(gitRepositoryProblem(entry)).toBe('');
  });

  it.each([
    ['git@gitlab.example.com:grp/repo.git', 'acloud skips SSH remotes'],
    ['ssh://git@gitlab.example.com/grp/repo.git', 'acloud skips SSH remotes'],
    ['http://gitlab.example.com/grp/repo.git', 'Use an https:// URL.'],
    ['gitlab.example.com/grp/repo.git', 'Use an https:// URL.'],
    ['https://user@gitlab.example.com/grp/repo.git', 'Remove the user name'],
    ['https://user:secret@github.com/org/tool@main', 'Remove the user name'],
    ['https://github.com', 'Add the repository path'],
    ['https://github.com/', 'Add the repository path'],
    ['https://github.com@main', 'Add the repository path'],
    ['https://github.com/org/.git', 'Add the repository path'],
  ])('explains %s', (entry, problem) => {
    expect(gitRepositoryProblem(entry)).toContain(problem);
  });
});

describe('gitTokenHint', () => {
  const gitlab = 'https://gitlab.example.com/grp/repo.git';
  const github = 'https://github.com/org/tool@main';

  it('asks for the token the host needs when none is forwarded', () => {
    expect(gitTokenHint(gitlab, [])).toBe(
      'If this repository is private, forward GITLAB_TOKEN under Environment variables.',
    );
    expect(gitTokenHint(github, ['ANTHROPIC_API_KEY'])).toContain('forward GITHUB_TOKEN');
  });

  it('stays quiet when the matching token is forwarded, with or without a value', () => {
    expect(gitTokenHint(gitlab, ['GITLAB_TOKEN'])).toBe('');
    expect(gitTokenHint(github, ['GITHUB_TOKEN=demo'])).toBe('');
    expect(gitTokenHint(github, ['GH_TOKEN'])).toBe('');
  });

  it('names the token acloud uses when it is the wrong one for the host', () => {
    expect(gitTokenHint(github, ['GITLAB_TOKEN', 'GITHUB_TOKEN'])).toBe(
      'If this repository is private: acloud clones with GITLAB_TOKEN, not GITHUB_TOKEN.',
    );
    expect(gitTokenHint(gitlab, ['GH_TOKEN'])).toContain('acloud clones with GH_TOKEN');
  });

  it('gives no hint for other hosts, blank rows or invalid entries', () => {
    expect(gitTokenHint('https://code.example.com/grp/repo.git', [])).toBe('');
    expect(gitTokenHint('', [])).toBe('');
    expect(gitTokenHint('git@github.com:org/tool.git', [])).toBe('');
  });
});

describe('tokenAcloudClonesWith', () => {
  it("picks the first forwarded token in acloud's order", () => {
    expect(tokenAcloudClonesWith(['GH_TOKEN', 'GITHUB_TOKEN'])).toBe('GITHUB_TOKEN');
    expect(tokenAcloudClonesWith(['HOME'])).toBeUndefined();
  });
});

describe('recent git repositories', () => {
  it('strips the ref and any credentials', () => {
    expect(gitRepositoryUrlWithoutCredentials('https://github.com/org/tool.git@main')).toBe(
      'https://github.com/org/tool.git',
    );
    expect(
      gitRepositoryUrlWithoutCredentials('https://user:secret@gitlab.example.com/grp/repo.git@v1'),
    ).toBe('https://gitlab.example.com/grp/repo.git');
  });

  it('keeps the newest ten without duplicates or entries acloud would not clone', () => {
    const recent = Array.from({ length: 10 }, (_, index) => `https://github.com/org/old-${index}`);
    expect(
      rememberRecentGitRepositories(recent, [
        'https://github.com/org/old-3@main',
        'git@github.com:org/ssh.git',
        'https://github.com/org/new',
        '',
      ]),
    ).toEqual([
      'https://github.com/org/old-3',
      'https://github.com/org/new',
      ...recent.filter((url) => !url.endsWith('old-3')).slice(0, 8),
    ]);
  });
});
