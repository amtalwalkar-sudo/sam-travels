import type { CSSProperties } from "react";
import presentation from "../../../../contracts/driver-presentation-v1.json";

/** Shared visual tokens. CSS consumes these variables; native Android reads the same JSON asset. */
export const driverPresentationContract = presentation;

export const driverPresentationCssVars = {
  "--driver-surface": presentation.colors.surface,
  "--driver-surface-raised": presentation.colors.surfaceRaised,
  "--driver-border": presentation.colors.border,
  "--driver-text": presentation.colors.text,
  "--driver-text-strong": presentation.colors.textStrong,
  "--driver-accent": presentation.colors.accent,
  "--driver-accent-soft": presentation.colors.accentSoft,
  "--driver-danger-surface": presentation.colors.dangerSurface,
  "--driver-danger-border": presentation.colors.dangerBorder,
  "--driver-danger-text": presentation.colors.dangerText,
  "--driver-hint": presentation.colors.hint,
  "--driver-disabled-opacity": String(presentation.colors.disabledOpacity),
  "--driver-card-radius": presentation.shape.cardRadius + "px",
  "--driver-field-radius": presentation.shape.fieldRadius + "px",
  "--driver-button-radius": presentation.shape.buttonRadius + "px",
  "--driver-web-card-padding": presentation.spacing.webCardPadding + "px",
  "--driver-field-gap": presentation.spacing.fieldGap + "px",
  "--driver-form-gap": presentation.spacing.formGap + "px",
  "--driver-field-height": presentation.sizing.fieldHeight + "px",
  "--driver-swipe-height": presentation.sizing.swipeHeight + "px",
  "--driver-label-size": presentation.typography.labelSp + "px",
  "--driver-strong-label-size": presentation.typography.strongLabelSp + "px",
  "--driver-hint-size": presentation.typography.hintSp + "px",
} as CSSProperties;
