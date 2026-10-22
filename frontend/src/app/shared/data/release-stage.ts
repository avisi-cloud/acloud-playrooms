// Also stated in README.md, scripts/generate-homebrew-cask.mjs and .github/workflows/release.yml.
export const RELEASE_STAGE = {
  label: 'Alpha',
  explanation:
    'This app is in alpha: it works, but it is still a work in progress. Things may change or break between versions.',
  feedbackUrl: 'https://github.com/avisi-cloud/acloud-playrooms/issues',
} as const;
