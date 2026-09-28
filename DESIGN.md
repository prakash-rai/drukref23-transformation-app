---
name: DrukRef Transformation Tool
description: A clear NLCS field operations desk for converting approved DrukRef03 data to Bhutan's national reference system.
colors:
  forest-green: "#173c34"
  forest-green-light: "#2f6958"
  parchment: "#f4f1e9"
  sage: "#e5eee4"
  sage-light: "#f2f6ef"
  amber: "#f4a261"
  coral: "#e76f51"
  ink: "#17251f"
  muted-ink: "#56655c"
  white: "#ffffff"
typography:
  display:
    fontFamily: "system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  body:
    fontFamily: "system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  sm: "0.375rem"
  md: "0.75rem"
  lg: "0.75rem"
spacing:
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.coral}"
    textColor: "{colors.white}"
    rounded: "{rounded.sm}"
    padding: "0.625rem 1rem"
---

# Design System: DrukRef Transformation Tool

## Overview

**Creative North Star: "NLCS field operations desk"**

The interface is professional, clear, confident, and practical. It uses a light parchment workspace with forest-green structure and restrained warm accents, keeping the DrukRef03-to-DrukRef23 transformation task calm while making the primary action unmistakable.

The visual language is grounded in NLCS identity rather than decoration: compact operational cards, generous breathing room, soft borders, and concise status copy. The palette balances institutional green with sage surfaces and coral action emphasis.

**Key Characteristics:**
- Forest-green structure on a light parchment workspace.
- Sage and amber surfaces distinguish preparation guidance from dataset review.
- Coral is reserved for the primary projection action.
- Rounded cards, soft borders, and ambient shadows provide quiet hierarchy.

## Colors

The palette combines institutional forest green with warm paper, muted sage, amber guidance, and coral action emphasis.

### Primary
- **Forest Green** (#173c34): Header, strong headings, and NLCS structure.
- **Forest Green Light** (#2f6958): Supporting accents and icons.
- **Coral Action** (#e76f51): Primary projection action and high-attention state.

### Secondary
- **Amber Guidance** (#f4a261): Instruction emphasis and informational icon treatment.

### Neutral
- **Parchment** (#f4f1e9): Main page background.
- **Sage Surface** (#e5eee4): Preparation guidance surface.
- **Sage Light** (#f2f6ef): Notes, activity summaries, and empty-state surfaces.
- **Ink** (#17251f): Primary text.
- **Muted Ink** (#56655c): Supporting copy.
- **White** (#ffffff): Dataset and control surfaces.

## Typography

**Display Font:** system-ui, sans-serif
**Body Font:** system-ui, sans-serif

**Character:** A practical sans-serif system keeps operational copy legible and compact. Weight and tracking create hierarchy without introducing a second voice.

### Hierarchy
- **Headline** (600, 1.5rem, 1.1): Main transformation heading.
- **Title** (600, 1rem, tight): Card and dataset names.
- **Body** (400, 0.9375rem, 1.6): Explanations and workflow guidance.
- **Label** (500, 0.75rem, uppercase tracking): Service and brand metadata.

## Layout

The app uses a centered, narrow desktop workspace with a maximum width of approximately 48rem. The flow is vertical: orientation, dataset selection, projection action, then activity or guidance. Cards use consistent internal padding and a compact gap rhythm. Responsive grids collapse to one column on narrow screens.

## Elevation & Depth

Depth is a hybrid of tonal layering and ambient shadows. Parchment establishes the workspace, white cards hold interactive data, and sage surfaces carry guidance. Shadows are soft and offset, never hard or decorative.

## Shapes

The form language uses modest rounded corners, thin muted borders, and rectangular operational surfaces. Corners remain consistent across cards, inputs, buttons, notes, and activity states.

## Components

### Buttons
- **Shape:** modest radius (0.375rem).
- **Primary:** coral background with white text and a soft coral shadow.
- **Secondary:** white surface, muted border, and forest-green-compatible text.
- **Hover / Focus:** darkened fill or quiet surface shift with visible keyboard focus.

### Cards / Containers
- **Corner Style:** rounded (0.75rem for major cards).
- **Background:** white for data, sage for guidance and notes.
- **Shadow Strategy:** soft ambient shadow on major containers only.
- **Border:** thin muted sage or slate border.
- **Internal Padding:** compact controls and generous section separation.

### Inputs / Fields
- **Style:** visually hidden file input paired with explicit action buttons.
- **Focus:** browser-visible focus treatment on the actionable button.
- **Error:** concise red text with an icon and a recovery-oriented message.

### Signature Component
- **Projection activity:** replaces the compact workflow guidance note after submission, preserving its collapsed footprint while offering progressive disclosure through See all activity.

## Do's and Don'ts

### Do:
- **Do** reserve coral for the primary projection action and important progress emphasis.
- **Do** use sage surfaces for guidance, empty states, and compact activity summaries.
- **Do** keep dataset controls concise and reviewable.
- **Do** preserve keyboard access and reduced-motion behavior.

### Don't:
- **Don't** introduce GeoJSON into the supported input flow.
- **Don't** use hard shadows, gradients, or decorative visual noise.
- **Don't** hide dataset inclusion state or service failures.
