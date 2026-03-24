/**
 * Purpose:
 * - Prevent AppRun JSX child loss across shared web primitives and patterns.
 *
 * Key Features:
 * - Verifies modal-shell body copy and footer action labels survive function-component composition.
 * - Verifies select controls keep JSX option labels when rendered through the pattern layer.
 *
 * Notes on Implementation:
 * - Uses AppRun's real JSX factory semantics so the test matches the runtime child-passing contract.
 * - Asserts rendered HTML output instead of internal vnode structure.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Added regression coverage for AppRun function-component child forwarding.
 */

import { createRequire } from 'node:module';
import app from 'apprun';
import { describe, expect, it } from 'vitest';

import { ActionButton, ModalShell, SelectControl } from '../../web/src/patterns';

const require = createRequire(import.meta.url);
const toHTML = require('apprun/viewEngine')('html') as (vdom: unknown) => string;

function stripUndefinedDeep(value: any): any {
  if (Array.isArray(value)) {
    return value.map(stripUndefinedDeep);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, stripUndefinedDeep(entry)]),
  );
}

describe('web AppRun pattern children', () => {
  it('renders modal body copy and footer action labels from JSX children', () => {
    const tree = app.createElement(
      ModalShell,
      {
        title: 'Delete Message',
        footer: app.createElement(ActionButton, { className: 'btn-danger' }, 'Delete Message'),
      },
      app.createElement('p', null, 'Are you sure you want to delete this message?'),
    );

    const html = toHTML(stripUndefinedDeep(tree));

    expect(html).toContain('Are you sure you want to delete this message?');
    expect(html).toContain('Delete Message');
  });

  it('renders select option labels passed through JSX children', () => {
    const tree = app.createElement(
      SelectControl,
      { className: 'tool-permission-select' },
      app.createElement('option', { value: 'read' }, 'Read Only'),
      app.createElement('option', { value: 'ask' }, 'Ask First'),
    );

    const html = toHTML(stripUndefinedDeep(tree));

    expect(html).toContain('Read Only');
    expect(html).toContain('Ask First');
  });
});
