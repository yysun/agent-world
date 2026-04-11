/**
 * SkillInstallBrowser Component Tests
 * Purpose:
 * - Verify the install browse/search stage renders in the main editor area and dispatches selection actions.
 *
 * Key Features:
 * - Confirms GitHub controls live in the content area rather than the toolbar.
 * - Confirms result selection and preview entry callbacks fire.
 * - Confirms local mode renders a folder candidate preview action.
 *
 * Implementation Notes:
 * - Uses virtual React/JSX mocks to inspect the rendered component tree without jsdom.
 * - Stubs BaseEditor so tests can assert toolbar/content slot boundaries directly.
 *
 * Recent Changes:
 * - 2026-04-11: Local-folder assertions now cover scanning a chosen root and rendering discovered skills from nested `skills/*` directories.
 * - 2026-04-11: Restored coverage for the GitHub and Local Folder source selector plus the local-folder preview card.
 * - 2026-04-11: Removed local-skill assertions because the install browser now only shows GitHub-found skills.
 * - 2026-04-11: GitHub browse assertions now validate found-skill descriptions render with the same card content treatment as local skills.
 * - 2026-04-11: Removed assertions for the extra found/local section headers so coverage matches the simplified result-card layout.
 * - 2026-04-11: Updated GitHub browse coverage so found skills reuse the local list format and open preview directly on click.
 * - 2026-04-11: Reworked local-mode assertions around the clickable local skill list and removed search-view source/scope controls.
 * - 2026-04-11: Added local candidate list assertions for the welcome-card-style local preview block.
 * - 2026-04-11: Updated coverage for the grouped top filters and welcome-card-style GitHub result list.
 * - 2026-04-11: Initial coverage for the skill-install browse/search stage.
 */

import { describe, expect, it, vi } from 'vitest';

const { jsxFactory } = vi.hoisted(() => ({
  jsxFactory: (type: unknown, props: Record<string, unknown> | null, key?: unknown) => ({
    type,
    props: props ?? {},
    key,
  }),
}));

vi.mock('react', () => ({
  default: { createElement: jsxFactory },
}), { virtual: true });

vi.mock('react/jsx-runtime', () => ({
  Fragment: 'Fragment',
  jsx: jsxFactory,
  jsxs: jsxFactory,
}), { virtual: true });

vi.mock('react/jsx-dev-runtime', () => ({
  Fragment: 'Fragment',
  jsxDEV: jsxFactory,
}), { virtual: true });

const { baseEditorStub } = vi.hoisted(() => ({
  baseEditorStub: Symbol('BaseEditor'),
}));

vi.mock('../../../electron/renderer/src/design-system/patterns/BaseEditor', () => ({
  default: baseEditorStub,
}));

import { SkillInstallBrowser } from '../../../electron/renderer/src/features/skills';
import { Button, Input } from '../../../electron/renderer/src/design-system/primitives';

function allDescendants(node: any): any[] {
  if (!node || typeof node !== 'object') return [];
  const children = node.props?.children;
  if (!children) return [node];
  const childArr = Array.isArray(children) ? children : [children];
  return [node, ...childArr.flatMap(allDescendants)];
}

describe('SkillInstallBrowser', () => {
  it('renders GitHub browse controls in the main content area and previews a clicked found skill', () => {
    const onBack = vi.fn();
    const onSourceTypeChange = vi.fn();
    const onSourcePathChange = vi.fn();
    const onBrowseSource = vi.fn();
    const onRepoChange = vi.fn();
    const onSearchQueryChange = vi.fn();
    const onLoadInstallOptions = vi.fn();
    const onPreviewSelection = vi.fn();

    const result: any = SkillInstallBrowser({
      sourceType: 'github',
      sourcePath: '',
      repo: 'yysun/awesome-agent-world',
      availableGitHubSkills: [
        { skillId: 'planner', description: 'Plans work before implementation.' },
        { skillId: 'reviewer', description: 'Reviews changes for regressions and missing tests.' },
      ],
      availableLocalSkills: [],
      searchQuery: 'rev',
      loadingGitHubOptions: false,
      loadingLocalOptions: false,
      loadingPreview: false,
      installing: false,
      onBack,
      onSourceTypeChange,
      onSourcePathChange,
      onBrowseSource,
      onRepoChange,
      onSearchQueryChange,
      onLoadGitHubOptions: onLoadInstallOptions,
      onLoadLocalOptions: () => { },
      onPreviewSelection,
    });

    expect(result.type).toBe(baseEditorStub);

    const toolbarStr = JSON.stringify(result.props.toolbar);
    expect(toolbarStr).toContain('INSTALL SKILL');
    expect(toolbarStr).not.toContain('owner/repo');
    expect(toolbarStr).not.toContain('Search skills');

    const nodes = allDescendants(result.props.children);
    const repoInput = nodes.find((node: any) => node?.type === Input && node?.props?.placeholder === 'owner/repo');
    const searchInput = nodes.find((node: any) => node?.type === Input && node?.props?.placeholder === 'Search skills');
    const loadButton = nodes.find((node: any) => node?.type === Button && node?.props?.children === 'Load skills');
    const resultList = nodes.find((node: any) => node?.type === 'ul' && node?.props?.role === 'list' && node?.props?.['aria-label'] === 'Found skills');
    const resultItem = nodes.find((node: any) => node?.type === 'li' && JSON.stringify(node).includes('reviewer'));
    const resultButton = nodes.find((node: any) => node?.type === 'button' && JSON.stringify(node).includes('reviewer'));
    const githubToggleButton = nodes.find((node: any) => node?.type === Button && node?.props?.children === 'GitHub');
    const localToggleButton = nodes.find((node: any) => node?.type === Button && node?.props?.children === 'Local Folder');
    const backButton = allDescendants(result.props.toolbar).find((node: any) => node?.type === Button && node?.props?.onClick === onBack);
    const contentStr = JSON.stringify(result.props.children);

    expect(repoInput).toBeDefined();
    expect(searchInput).toBeDefined();
    expect(loadButton).toBeDefined();
    expect(resultList).toBeDefined();
    expect(resultItem?.props?.className).not.toContain('ring-1');
    expect(resultButton).toBeDefined();
    expect(resultButton?.props?.className).not.toContain('bg-primary/10');
    expect(githubToggleButton).toBeDefined();
    expect(localToggleButton).toBeDefined();
    expect(backButton).toBeDefined();
    expect(contentStr).toContain('Browse installable skills');
    expect(contentStr).toContain('Reviews changes for regressions and missing tests.');
    expect(contentStr).not.toContain('Open this skill in install preview.');
    expect(contentStr).not.toContain('Loaded in install preview. Click to reopen it.');
    expect(contentStr).not.toContain('Requirement-plan-deliver workflow.');
    expect(contentStr).not.toContain('Install scope');
    expect(contentStr).not.toContain('Preview selected skill');
    expect(contentStr).not.toContain('Local skills');

    repoInput?.props?.onChange({ target: { value: 'yysun/apprun-skills' } });
    searchInput?.props?.onChange({ target: { value: 'plan' } });
    loadButton?.props?.onClick();
    resultButton?.props?.onClick();
    localToggleButton?.props?.onClick();
    backButton?.props?.onClick();

    expect(onRepoChange).toHaveBeenCalledWith('yysun/apprun-skills');
    expect(onSearchQueryChange).toHaveBeenCalledWith('plan');
    expect(onLoadInstallOptions).toHaveBeenCalledTimes(1);
    expect(onPreviewSelection).toHaveBeenCalledTimes(1);
    expect(onPreviewSelection).toHaveBeenCalledWith('reviewer');
    expect(onSourceTypeChange).toHaveBeenCalledWith('local');
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders the local-folder selector state and previews the chosen folder card', () => {
    const onBack = vi.fn();
    const onSourceTypeChange = vi.fn();
    const onSourcePathChange = vi.fn();
    const onBrowseSource = vi.fn();
    const onPreviewSelection = vi.fn();

    const result: any = SkillInstallBrowser({
      sourceType: 'local',
      sourcePath: '/tmp/workspace',
      repo: 'yysun/awesome-agent-world',
      availableGitHubSkills: [],
      availableLocalSkills: [
        {
          skillId: 'planner',
          description: 'Plans work before implementation.',
          folderPath: '/tmp/workspace/packages/tools/skills/planner',
          relativePath: 'packages/tools/skills/planner',
        },
        {
          skillId: 'repo-root-skill',
          description: 'Skill shipped at the selected root.',
          folderPath: '/tmp/workspace',
          relativePath: '.',
        },
      ],
      searchQuery: '',
      loadingGitHubOptions: false,
      loadingLocalOptions: false,
      loadingPreview: false,
      installing: false,
      onBack,
      onSourceTypeChange,
      onSourcePathChange,
      onBrowseSource,
      onRepoChange: () => { },
      onSearchQueryChange: () => { },
      onLoadGitHubOptions: () => { },
      onLoadLocalOptions: onBrowseSource,
      onPreviewSelection,
    });

    const nodes = allDescendants(result.props.children);
    const pathInput = nodes.find((node: any) => node?.type === Input && node?.props?.placeholder === '/path/to/project-or-skill-root');
    const browseButton = nodes.find((node: any) => node?.type === Button && node?.props?.children === 'Browse folder');
    const scanButton = nodes.find((node: any) => node?.type === Button && node?.props?.children === 'Scan skills');
    const localCardButton = nodes.find((node: any) => node?.type === 'button' && JSON.stringify(node).includes('Plans work before implementation.'));
    const githubToggleButton = nodes.find((node: any) => node?.type === Button && node?.props?.children === 'GitHub');
    const contentStr = JSON.stringify(result.props.children);

    expect(pathInput).toBeDefined();
    expect(browseButton).toBeDefined();
    expect(scanButton).toBeDefined();
    expect(localCardButton).toBeDefined();
    expect(githubToggleButton).toBeDefined();
    expect(contentStr).toContain('Choose a local folder that contains SKILL.md to preview and install it.');
    expect(contentStr).not.toContain('Open this skill in install preview.');
    expect(contentStr).not.toContain('Loaded in install preview. Click to reopen it.');
    expect(contentStr).not.toContain('owner/repo');

    pathInput?.props?.onChange({ target: { value: '/tmp/skills/reviewer' } });
    browseButton?.props?.onClick();
    scanButton?.props?.onClick();
    githubToggleButton?.props?.onClick();
    localCardButton?.props?.onClick();

    expect(onSourcePathChange).toHaveBeenCalledWith('/tmp/skills/reviewer');
    expect(onBrowseSource).toHaveBeenCalledTimes(2);
    expect(onSourceTypeChange).toHaveBeenCalledWith('github');
    expect(onPreviewSelection).toHaveBeenCalledWith('planner', '/tmp/workspace/packages/tools/skills/planner');
  });

  it('shows a GitHub-only empty state before repo skills are loaded', () => {
    const result: any = SkillInstallBrowser({
      sourceType: 'github',
      sourcePath: '',
      repo: '',
      availableGitHubSkills: [],
      availableLocalSkills: [],
      searchQuery: '',
      loadingGitHubOptions: false,
      loadingLocalOptions: false,
      loadingPreview: false,
      installing: false,
      onBack: () => { },
      onSourceTypeChange: () => { },
      onSourcePathChange: () => { },
      onBrowseSource: () => { },
      onRepoChange: () => { },
      onSearchQueryChange: () => { },
      onLoadGitHubOptions: () => { },
      onLoadLocalOptions: () => { },
      onPreviewSelection: () => { },
    });

    const contentStr = JSON.stringify(result.props.children);

    expect(contentStr).toContain('Load a GitHub repo to browse installable skill folders.');
    expect(contentStr).not.toContain('Local skills');
  });
});