/**
 * Editor Modals Host Component
 * Purpose:
 * - Host editor modal orchestration for prompt and world config editing.
 *
 * Key Features:
 * - Renders prompt editor modal for create/edit agent system prompt updates.
 * - Renders world config editor modal for edit-world config field updates.
 * - Applies updates via parent-provided state setters while preserving existing flows.
 *
 * Implementation Notes:
 * - Receives all modal state and callbacks from `App.jsx`.
 * - Keeps behavior identical to the previously inline modal wiring in `App.jsx`.
 *
 * Recent Changes:
 * - 2026-02-17: Extracted from `App.jsx` as part of Phase 4 component decomposition.
 */

import PromptEditorModal from './PromptEditorModal';
import WorldConfigEditorModal from './WorldConfigEditorModal';

export default function EditorModalsHost({
  promptEditorOpen,
  promptEditorValue,
  setPromptEditorValue,
  setPromptEditorOpen,
  promptEditorTarget,
  setCreatingAgent,
  setEditingAgent,
  worldConfigEditorOpen,
  worldConfigEditorField,
  worldConfigEditorValue,
  setWorldConfigEditorValue,
  setWorldConfigEditorOpen,
  worldConfigEditorTarget,
  setEditingWorld,
}) {
  return (
    <>
      <PromptEditorModal
        open={promptEditorOpen}
        value={promptEditorValue}
        onChange={setPromptEditorValue}
        onClose={() => setPromptEditorOpen(false)}
        onApply={() => {
          if (promptEditorTarget === 'create') {
            setCreatingAgent((value) => ({ ...value, systemPrompt: promptEditorValue }));
          } else if (promptEditorTarget === 'edit') {
            setEditingAgent((value) => ({ ...value, systemPrompt: promptEditorValue }));
          }
          setPromptEditorOpen(false);
        }}
      />

      <WorldConfigEditorModal
        open={worldConfigEditorOpen}
        field={worldConfigEditorField}
        value={worldConfigEditorValue}
        onChange={setWorldConfigEditorValue}
        onClose={() => setWorldConfigEditorOpen(false)}
        onApply={() => {
          if (worldConfigEditorTarget === 'edit') {
            setEditingWorld((value) => ({
              ...value,
              [worldConfigEditorField]: worldConfigEditorValue
            }));
          }
          setWorldConfigEditorOpen(false);
        }}
      />
    </>
  );
}