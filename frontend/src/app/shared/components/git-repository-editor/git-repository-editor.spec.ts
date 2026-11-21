import { TestBed } from '@angular/core/testing';
import { GitRepositoryEditorComponent } from './git-repository-editor';
import { updateCache } from '../../utils';

describe('GitRepositoryEditorComponent', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('explains invalid entries and hints at a missing token', () => {
    const fixture = TestBed.createComponent(GitRepositoryEditorComponent);
    fixture.componentRef.setInput('values', [
      'git@github.com:org/tool.git',
      'https://gitlab.example.com/grp/repo.git',
    ]);
    fixture.detectChanges();
    const hints = fixture.nativeElement.querySelectorAll('.field-hint');
    expect(hints[0].textContent).toContain('acloud skips SSH remotes');
    expect(hints[0].classList).toContain('error');
    expect(hints[1].textContent).toContain('forward GITLAB_TOKEN');
    expect(hints[1].classList).not.toContain('error');
    expect(
      fixture.nativeElement.querySelector('input[aria-label="git repository 1"]').ariaInvalid,
    ).toBe('true');

    fixture.componentRef.setInput('environmentVariables', ['GITLAB_TOKEN']);
    fixture.detectChanges();
    expect(fixture.componentInstance.tokenHints()[1]).toBe('');
  });

  it('suggests recent repositories that are not listed yet', () => {
    updateCache({
      recentGitRepositories: ['https://github.com/org/api', 'https://github.com/org/web'],
    });
    const fixture = TestBed.createComponent(GitRepositoryEditorComponent);
    fixture.componentRef.setInput('values', ['https://github.com/org/api@main']);
    fixture.detectChanges();
    const options = [...fixture.nativeElement.querySelectorAll('datalist option')].map(
      (option: HTMLOptionElement) => option.value,
    );
    expect(options).toEqual(['https://github.com/org/web']);
    const input = fixture.nativeElement.querySelector('input');
    expect(input.getAttribute('list')).toBe(fixture.nativeElement.querySelector('datalist').id);
  });
});
