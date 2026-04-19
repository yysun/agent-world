/**
 * Settings Panel Content
 * Purpose:
 * - Render the settings feature body inside the shell right panel.
 *
 * Key Features:
 * - Theme preference controls.
 * - Skill scope toggles and per-skill enablement rows.
 * - Save/cancel action bar for system settings changes.
 *
 * Implementation Notes:
 * - Stays feature-owned even though it renders inside shell chrome.
 *
 * Recent Changes:
 * - 2026-04-19: Extracted from the shell right-panel catch-all into the settings feature.
 */

import { PanelActionBar } from '../../../design-system/patterns';
import { SettingsSkillSwitch, SettingsSwitch } from './index';

const CANONICAL_GLOBAL_SKILL_ROOT_LABEL = '~/.agent-world/skills';
const CANONICAL_PROJECT_SKILL_ROOT_LABEL = './.agent-world/skills';

export default function SettingsPanelContent({
  themePreference,
  setThemePreference,
  systemSettings,
  setSystemSettings,
  globalSkillEntries,
  disabledGlobalSkillIdSet,
  setGlobalSkillsEnabled,
  toggleSkillEnabled,
  projectSkillEntries,
  disabledProjectSkillIdSet,
  setProjectSkillsEnabled,
  onCancelSettings,
  savingSystemSettings,
  onSaveSettings,
  settingsNeedRestart,
  onEditSkill,
  onInstallSkill,
}) {
  const globalSkillsEnabled = systemSettings.enableGlobalSkills !== false;
  const projectSkillsEnabled = systemSettings.enableProjectSkills !== false;
  const hasGlobalSkillEntries = globalSkillEntries.length > 0;
  const hasProjectSkillEntries = projectSkillEntries.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-sidebar-foreground/90">Theme</label>
          <div className="inline-flex items-center rounded-md border border-sidebar-border bg-sidebar-accent p-0.5">
            {['system', 'light', 'dark'].map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setThemePreference(mode)}
                className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${themePreference === mode
                  ? 'bg-primary text-primary-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground'
                  }`}
                title={`${mode.charAt(0).toUpperCase() + mode.slice(1)} theme`}
              >
                {mode === 'system' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                ) : mode === 'light' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                    <circle cx="12" cy="12" r="4" />
                    <line x1="12" y1="2" x2="12" y2="4" />
                    <line x1="12" y1="20" x2="12" y2="22" />
                    <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
                    <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
                    <line x1="2" y1="12" x2="4" y2="12" />
                    <line x1="20" y1="12" x2="22" y2="12" />
                    <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
                    <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 pt-1">
          <SettingsSwitch
            label="Show tool messages"
            checked={systemSettings.showToolMessages !== false}
            onClick={() => setSystemSettings((settings) => ({ ...settings, showToolMessages: settings.showToolMessages === false }))}
          />
          <SettingsSwitch
            label="Enable Global Skills"
            checked={globalSkillsEnabled}
            onClick={() => setGlobalSkillsEnabled(systemSettings.enableGlobalSkills === false)}
            disabled={savingSystemSettings}
          />
          {globalSkillsEnabled && !hasGlobalSkillEntries ? (
            <p className="px-1 pb-1 text-[10px] text-sidebar-foreground/45">
              Global skills default to {CANONICAL_GLOBAL_SKILL_ROOT_LABEL}.
            </p>
          ) : null}
          {globalSkillsEnabled ? (
            <div className="ml-1 space-y-0.5">
              {hasGlobalSkillEntries ? (
                globalSkillEntries.map((entry) => (
                  <div key={`global-${entry.skillId}`} className="group flex items-center">
                    {typeof onEditSkill === 'function' ? (
                      <button
                        type="button"
                        aria-label={`Edit skill ${entry.skillId}`}
                        onClick={() => onEditSkill(entry)}
                        className="mr-1 flex-none rounded p-0.5 text-sidebar-foreground/30 opacity-0 transition-opacity hover:text-sidebar-foreground/80 group-hover:opacity-100"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      </button>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <SettingsSkillSwitch
                        label={entry.skillId}
                        checked={!disabledGlobalSkillIdSet.has(entry.skillId)}
                        onClick={() => toggleSkillEnabled('global', entry.skillId)}
                        disabled={savingSystemSettings}
                      />
                    </div>
                  </div>
                ))
              ) : null}
            </div>
          ) : null}

          <SettingsSwitch
            label="Enable Project Skills"
            checked={projectSkillsEnabled}
            onClick={() => setProjectSkillsEnabled(systemSettings.enableProjectSkills === false)}
            disabled={savingSystemSettings}
          />
          {projectSkillsEnabled && !hasProjectSkillEntries ? (
            <p className="px-1 pb-1 text-[10px] text-sidebar-foreground/45">
              Project skills default to {CANONICAL_PROJECT_SKILL_ROOT_LABEL}.
            </p>
          ) : null}
          {projectSkillsEnabled ? (
            <div className="ml-1 space-y-0.5">
              {hasProjectSkillEntries ? (
                projectSkillEntries.map((entry) => (
                  <div key={`project-${entry.skillId}`} className="group flex items-center">
                    {typeof onEditSkill === 'function' ? (
                      <button
                        type="button"
                        aria-label={`Edit skill ${entry.skillId}`}
                        onClick={() => onEditSkill(entry)}
                        className="mr-1 flex-none rounded p-0.5 text-sidebar-foreground/30 opacity-0 transition-opacity hover:text-sidebar-foreground/80 group-hover:opacity-100"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      </button>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <SettingsSkillSwitch
                        label={entry.skillId}
                        checked={!disabledProjectSkillIdSet.has(entry.skillId)}
                        onClick={() => toggleSkillEnabled('project', entry.skillId)}
                        disabled={savingSystemSettings}
                      />
                    </div>
                  </div>
                ))
              ) : null}
              {typeof onInstallSkill === 'function' ? (
                <div className="flex justify-end px-1 pt-1">
                  <button
                    type="button"
                    onClick={onInstallSkill}
                    className="cursor-pointer text-[11px] font-medium text-sidebar-primary transition-colors hover:text-sidebar-primary/80"
                  >
                    Install Skill ...
                  </button>
                </div>
              ) : null}
            </div>
          ) : typeof onInstallSkill === 'function' ? (
            <div className="flex justify-end px-1 pt-1">
              <button
                type="button"
                onClick={onInstallSkill}
                className="cursor-pointer text-[11px] font-medium text-sidebar-primary transition-colors hover:text-sidebar-primary/80"
              >
                Install Skill ...
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <PanelActionBar>
        <button
          type="button"
          onClick={onCancelSettings}
          disabled={savingSystemSettings}
          className="rounded-xl border border-sidebar-border px-3 py-1 text-xs text-sidebar-foreground hover:bg-sidebar-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSaveSettings}
          disabled={savingSystemSettings}
          className="rounded-xl bg-sidebar-primary px-3 py-1 text-xs font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {savingSystemSettings ? 'Saving...' : (settingsNeedRestart ? 'Save & Restart' : 'Save')}
        </button>
      </PanelActionBar>
    </div>
  );
}
