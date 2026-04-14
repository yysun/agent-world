/**
 * SkillInstallBrowser Component
 * Purpose:
 * - Render the browse/search stage of the Electron skill-install flow.
 *
 * Key Features:
 * - Keeps install discovery controls in the main editor area instead of the toolbar.
 * - Supports GitHub repo browsing and opens discovered skills directly in the existing preview editor.
 * - Renders found skills with the same card treatment used elsewhere in the skills UI.
 *
 * Implementation Notes:
 * - Controlled component: App.tsx owns source state, candidate selection, and IPC actions.
 * - Reuses BaseEditor for full-area workspace framing while omitting the file-tree pane.
 *
 * Recent Changes:
 * - 2026-04-14: Promoted the Back action to the primary workspace-editor button treatment.
 * - 2026-04-11: Local-folder mode now scans the chosen root and lists discovered skills from the root plus nested skills directories.
 * - 2026-04-11: Restored the right-aligned GitHub/Local Folder source selector and local-folder preview card without bringing back the old local-skills list.
 * - 2026-04-11: Removed local-skill rendering from the install browser so the browse stage only shows GitHub-discovered skills.
 * - 2026-04-11: GitHub discovery cards now show fetched skill descriptions using the same content format as local skills.
 * - 2026-04-11: Removed the empty found-skills and local-header chrome so the results card only renders clickable skill rows and fallback text.
 * - 2026-04-11: Matched GitHub found-skill cards to the local-skill list treatment and made each found skill open preview on click.
 * - 2026-04-11: Replaced the local single-candidate block with a welcome-card-style clickable local skill list.
 * - 2026-04-11: Grouped source, scope, repo, and search controls into a top filter block and restyled GitHub results to match the welcome-card skill list layout.
 * - 2026-04-11: Initial browse/search surface for the two-stage skill install flow.
 */

import React from 'react';
import BaseEditor from '../../../design-system/patterns/BaseEditor';
import LabeledField from '../../../design-system/patterns/LabeledField';
import { Button, Card, Input } from '../../../design-system/primitives';
import { filterGitHubSkillOptions, filterLocalSkillOptions } from '../../../domain/skill-install-preview';
import type { GitHubSkillSummary, LocalSkillSummary } from '../../../types/desktop-api';
import { formatFullSkillDescription } from '../../../utils/formatting';

export default function SkillInstallBrowser({
  sourceType,
  sourcePath,
  repo,
  availableGitHubSkills,
  availableLocalSkills,
  searchQuery,
  loadingGitHubOptions,
  loadingLocalOptions,
  loadingPreview,
  installing,
  leftSidebarCollapsed = false,
  onBack,
  onSourceTypeChange,
  onSourcePathChange,
  onBrowseSource,
  onRepoChange,
  onSearchQueryChange,
  onLoadGitHubOptions,
  onLoadLocalOptions,
  onPreviewSelection,
}: {
  sourceType: 'github' | 'local';
  sourcePath: string;
  repo: string;
  availableGitHubSkills: GitHubSkillSummary[];
  availableLocalSkills: LocalSkillSummary[];
  searchQuery: string;
  loadingGitHubOptions: boolean;
  loadingLocalOptions: boolean;
  loadingPreview: boolean;
  installing: boolean;
  leftSidebarCollapsed?: boolean;
  onBack: () => void;
  onSourceTypeChange: (value: 'github' | 'local') => void;
  onSourcePathChange: (value: string) => void;
  onBrowseSource: () => void;
  onRepoChange: (value: string) => void;
  onSearchQueryChange: (value: string) => void;
  onLoadGitHubOptions: () => void;
  onLoadLocalOptions: (sourcePath?: string) => void;
  onPreviewSelection: (skillName?: string, localFolderPath?: string) => void;
}) {
  const busy = loadingPreview || installing;
  const filteredGitHubSkills = filterGitHubSkillOptions(availableGitHubSkills, searchQuery);
  const filteredLocalSkills = filterLocalSkillOptions(availableLocalSkills, searchQuery);
  const hasGitHubSkills = availableGitHubSkills.length > 0;
  const hasLocalSkills = availableLocalSkills.length > 0;
  const localSourceSelected = sourceType === 'local';
  const githubSourceSelected = sourceType === 'github';
  const toolbar = (
    <div className="flex items-center gap-3">
      <Button variant="primary" size="sm" onClick={onBack} disabled={busy} aria-label="Back">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back
      </Button>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">INSTALL SKILL</p>
        <p className="truncate text-sm font-medium text-foreground">Browse and preview a skill before install</p>
      </div>
    </div>
  );

  return (
    <BaseEditor reserveTrafficLightSpace={leftSidebarCollapsed} toolbar={toolbar}>
      <div className="flex h-full min-h-0 flex-col bg-background">
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
            <Card tone="muted" padding="lg" className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Browse installable skills</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {githubSourceSelected
                      ? 'Load a GitHub repo to preview installable skills.'
                      : 'Choose a local folder that contains SKILL.md to preview and install it.'}
                  </p>
                </div>
                <div className="ml-auto flex items-center justify-end gap-2 self-start">
                  <Button
                    variant={githubSourceSelected ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => onSourceTypeChange('github')}
                    disabled={busy}
                  >
                    GitHub
                  </Button>
                  <Button
                    variant={localSourceSelected ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => onSourceTypeChange('local')}
                    disabled={busy}
                  >
                    Local Folder
                  </Button>
                </div>
              </div>

              {githubSourceSelected ? (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.85fr)]">
                  <LabeledField label="GitHub repo">
                    <div className="flex items-center gap-2">
                      <Input
                        size="sm"
                        value={repo}
                        onChange={(event) => onRepoChange(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' || !repo.trim() || loadingGitHubOptions || busy) {
                            return;
                          }
                          event.preventDefault();
                          onLoadGitHubOptions();
                        }}
                        disabled={busy || loadingGitHubOptions}
                        placeholder="owner/repo"
                        className="min-w-0 flex-1"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onLoadGitHubOptions}
                        disabled={!repo.trim() || loadingGitHubOptions || busy}
                      >
                        {loadingGitHubOptions ? 'Loading…' : 'Load skills'}
                      </Button>
                    </div>
                  </LabeledField>

                  <LabeledField label="Search loaded skills">
                    <Input
                      size="sm"
                      value={searchQuery}
                      onChange={(event) => onSearchQueryChange(event.target.value)}
                      disabled={busy || loadingGitHubOptions || !hasGitHubSkills}
                      placeholder="Search skills"
                    />
                  </LabeledField>
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.85fr)]">
                  <LabeledField label="Local skill root">
                    <div className="flex items-center gap-2">
                      <Input
                        size="sm"
                        value={sourcePath}
                        onChange={(event) => onSourcePathChange(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' || !sourcePath.trim() || loadingLocalOptions || busy) {
                            return;
                          }
                          event.preventDefault();
                          onLoadLocalOptions(sourcePath);
                        }}
                        disabled={busy || loadingLocalOptions}
                        placeholder="/path/to/project-or-skill-root"
                        className="min-w-0 flex-1"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onBrowseSource}
                        disabled={busy || loadingLocalOptions}
                      >
                        Browse folder
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onLoadLocalOptions(sourcePath)}
                        disabled={!sourcePath.trim() || busy || loadingLocalOptions}
                      >
                        {loadingLocalOptions ? 'Scanning…' : 'Scan skills'}
                      </Button>
                    </div>
                  </LabeledField>

                  <LabeledField label="Search discovered skills">
                    <Input
                      size="sm"
                      value={searchQuery}
                      onChange={(event) => onSearchQueryChange(event.target.value)}
                      disabled={busy || loadingLocalOptions || !hasLocalSkills}
                      placeholder="Search local skills"
                    />
                  </LabeledField>
                </div>
              )}
            </Card>

            <Card padding="lg" className="min-h-[320px]">
              <div className="flex h-full flex-col gap-4">
                {githubSourceSelected && filteredGitHubSkills.length > 0 ? (
                  <div className="max-h-[48vh] overflow-y-auto pr-1">
                    <ul role="list" aria-label="Found skills" className="grid gap-1.5 sm:grid-cols-2">
                      {filteredGitHubSkills.map((skill) => {
                        return (
                          <li key={skill.skillId} className="rounded-md bg-muted/20 transition-colors">
                            <button
                              type="button"
                              onClick={() => onPreviewSelection(skill.skillId)}
                              disabled={busy || loadingGitHubOptions}
                              className={[
                                'block w-full rounded-md px-2.5 py-2 text-left text-foreground hover:bg-muted/60',
                                busy || loadingGitHubOptions ? 'cursor-not-allowed opacity-60' : '',
                              ].join(' ')}
                            >
                              <p className="text-[13px] font-medium leading-4 text-foreground">{skill.skillId}</p>
                              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{formatFullSkillDescription(skill.description)}</p>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : githubSourceSelected && hasGitHubSkills ? (
                  <p className="text-sm text-muted-foreground">No loaded skills match the current search.</p>
                ) : localSourceSelected && filteredLocalSkills.length > 0 ? (
                  <div className="max-h-[48vh] overflow-y-auto pr-1">
                    <ul role="list" aria-label="Local skills" className="grid gap-1.5 sm:grid-cols-2">
                      {filteredLocalSkills.map((skill) => {
                        return (
                          <li key={`${skill.relativePath}:${skill.skillId}`} className="rounded-md bg-muted/20 transition-colors">
                            <button
                              type="button"
                              onClick={() => onPreviewSelection(skill.skillId, skill.folderPath)}
                              disabled={busy || loadingLocalOptions}
                              className={[
                                'block w-full rounded-md px-2.5 py-2 text-left text-foreground hover:bg-muted/60',
                                busy || loadingLocalOptions ? 'cursor-not-allowed opacity-60' : '',
                              ].join(' ')}
                            >
                              <p className="text-[13px] font-medium leading-4 text-foreground">{skill.skillId}</p>
                              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{formatFullSkillDescription(skill.description)}</p>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : localSourceSelected && hasLocalSkills ? (
                  <p className="text-sm text-muted-foreground">No local skills match the current search.</p>
                ) : localSourceSelected ? (
                  <p className="text-sm text-muted-foreground">Choose a local root and scan for SKILL.md plus nested skills folders.</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Load a GitHub repo to browse installable skill folders.</p>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </BaseEditor>
  );
}