# Accessibility checklist

Use this quick checklist when adding UI or forms to the Firecash frontend.

## Interactive elements
- Provide a visible focus style for all interactive elements (buttons, links, inputs, selects).
- Ensure tab order follows the visual layout and never traps focus unexpectedly.
- Support keyboard actions for interactive UI (Enter/Space on buttons, Escape to close modals).

## Forms and inputs
- Use a `<label>` for every input, select, or textarea.
- Add `aria-describedby` when helper text or validation messages explain the control.
- Provide `aria-label` for icon-only controls.

## Content and visuals
- Confirm text and chart labels meet contrast guidelines (aim for WCAG AA).
- Add descriptive headings and section labels to convey structure.
- Provide accessible labels or summaries for data visualizations.

## Modals and overlays
- Move focus into the modal when it opens and return focus on close.
- Support closing with Escape and keep focus within the modal.

