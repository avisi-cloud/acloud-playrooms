import { Component, computed, input, model } from '@angular/core';
import { StringListEditorComponent } from '../string-list-editor/string-list-editor';
import { PLAYROOM_OPTION_TEXTS } from '../../data';
import {
  gitRepositoryProblem,
  gitRepositoryUrlWithoutCredentials,
  gitTokenHint,
  readCache,
} from '../../utils';

@Component({
  selector: 'app-git-repository-editor',
  imports: [StringListEditorComponent],
  template: `<app-string-list-editor
    [label]="optionTexts.git.label"
    [hint]="optionTexts.git.hint"
    [values]="values()"
    (valuesChange)="values.set($event)"
    [itemErrors]="problems()"
    [itemHints]="tokenHints()"
    [suggestions]="suggestions()"
    placeholder="https://gitlab.avisi.cloud/team/repo.git"
    addLabel="add git repo"
    itemLabel="git repository"
  />`,
})
export class GitRepositoryEditorComponent {
  readonly values = model.required<string[]>();
  /** The create form's environment variables, which say which clone token is forwarded. */
  readonly environmentVariables = input<string[]>([]);
  readonly optionTexts = PLAYROOM_OPTION_TEXTS;
  private readonly recentGitRepositories = readCache().recentGitRepositories;

  readonly problems = computed(() => this.values().map(gitRepositoryProblem));
  readonly tokenHints = computed(() =>
    this.values().map((entry) => gitTokenHint(entry, this.environmentVariables())),
  );
  /** Recent repositories not already in the list. */
  readonly suggestions = computed(() => {
    const listed = new Set(this.values().map(gitRepositoryUrlWithoutCredentials));
    return this.recentGitRepositories.filter((url) => !listed.has(url));
  });
}
