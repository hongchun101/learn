// commitlint.config.cjs
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'test',
        'chore',
        'revert',
        'perf',
        'build',
        'ci',
        'release',
      ],
    ],
    'scope-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
  },
};
