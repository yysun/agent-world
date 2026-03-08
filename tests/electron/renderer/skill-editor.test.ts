/**
 * SkillEditor Component Tests
 * Purpose:
 * - Verify SkillEditor renders toolbar with back + save, textarea content,
 *   and dispatches correct callbacks.
 *
 * Key Features:
 * - Back button fires onBack; Save button fires onSave.
 * - Textarea displays current content via value prop.
 * - Saving=true disables buttons and shows 'Saving…' label.
 *
 * Implementation Notes:
 * - Uses virtual React/JSX mocks to avoid jsdom; exercises component output props.
 * - Tests BaseEditor slot contract by inspecting children tree structure.
 *
 * Recent Changes:
 * - 2026-03-08: Initial test suite for SkillEditor component.
 */

import { describe, it, expect, vi } from 'vitest';

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

vi.mock('../../../electron/renderer/src/components/BaseEditor', () => ({
  default: baseEditorStub,
}));

import SkillEditor from '../../../electron/renderer/src/components/SkillEditor';

function allDescendants(node: any): any[] {
  if (!node || typeof node !== 'object') return [];
  const children = node.props?.children;
  if (!children) return [node];
  const childArr = Array.isArray(children) ? children : [children];
  return [node, ...childArr.flatMap(allDescendants)];
}

function allNodes(toolbar: any): any[] {
  return allDescendants(toolbar);
}

describe('SkillEditor', () => {
  it('renders BaseEditor with correct chatPaneContext and skillId in toolbar', () => {
    const result: any = SkillEditor({
      skillId: 'rpd',
      content: '# RPD Skill',
      onContentChange: () => { },
      onBack: () => { },
      onSave: () => { },
      saving: false,
    });

    // The root element should be BaseEditor (via jsxFactory type = baseEditorStub)
    expect(result.type).toBe(baseEditorStub);
    expect(result.props.chatPaneContext).toBe('rpd');

    // The textarea in children should have the content as value
    const nodes = allDescendants(result.props.children);
    const textarea = nodes.find((n: any) => n?.type === 'textarea');
    expect(textarea).toBeDefined();
    expect(textarea.props.value).toBe('# RPD Skill');
    expect(textarea.props.disabled).toBe(false);

    // toolbar should contain 'rpd' text somewhere
    const toolbarStr = JSON.stringify(result.props.toolbar);
    expect(toolbarStr).toContain('rpd');
  });

  it('back button onClick is wired to onBack', () => {
    const onBack = vi.fn();
    const result: any = SkillEditor({
      skillId: 'my-skill',
      content: '',
      onContentChange: () => { },
      onBack,
      onSave: () => { },
      saving: false,
    });

    const nodes = allNodes(result.props.toolbar);
    const backBtn = nodes.find(
      (n: any) => n?.type === 'button' && n?.props?.onClick === onBack
    );
    expect(backBtn).toBeDefined();
    backBtn.props.onClick();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('save button onClick is wired to onSave and shows Save label', () => {
    const onSave = vi.fn();
    const result: any = SkillEditor({
      skillId: 'my-skill',
      content: '',
      onContentChange: () => { },
      onBack: () => { },
      onSave,
      saving: false,
    });

    const nodes = allNodes(result.props.toolbar);
    const saveBtn = nodes.find(
      (n: any) => n?.type === 'button' && n?.props?.onClick === onSave
    );
    expect(saveBtn).toBeDefined();
    saveBtn.props.onClick();
    expect(onSave).toHaveBeenCalledTimes(1);

    const toolbarStr = JSON.stringify(result.props.toolbar);
    expect(toolbarStr).toContain('Save');
  });

  it('disables textarea and toolbar buttons when saving=true and shows Saving label', () => {
    const result: any = SkillEditor({
      skillId: 'my-skill',
      content: 'hello',
      onContentChange: () => { },
      onBack: () => { },
      onSave: () => { },
      saving: true,
    });

    const textareaNodes = allDescendants(result.props.children);
    const textarea = textareaNodes.find((n: any) => n?.type === 'textarea');
    expect(textarea?.props?.disabled).toBe(true);

    const toolbarNodes = allNodes(result.props.toolbar);
    const disabledButtons = toolbarNodes.filter(
      (n: any) => n?.type === 'button' && n?.props?.disabled === true
    );
    expect(disabledButtons.length).toBeGreaterThanOrEqual(1);

    const toolbarStr = JSON.stringify(result.props.toolbar);
    expect(toolbarStr).toContain('Saving');
  });
});
