/**
 * Framework-neutral contracts consumed by any presentation shell.
 * This package intentionally has no dependency on React, domain, storage,
 * application services, or feature implementations.
 */
export type ShellNavigationItem<Screen extends string = string, Icon extends string = string> = Readonly<{
  screen: Screen;
  label: string;
  icon: Icon;
}>;

export type ApplicationShellDefinition<
  Screen extends string = string,
  Icon extends string = string,
> = Readonly<{
  id: string;
  version: number;
  initialScreen: Screen;
  navigation: readonly ShellNavigationItem<Screen, Icon>[];
}>;

/** Validate and freeze a shell description before a renderer consumes it. */
export function defineApplicationShell<
  const Items extends readonly ShellNavigationItem<string, string>[],
>(definition: {
  id: string;
  version: number;
  initialScreen: Items[number]["screen"];
  navigation: Items;
}): ApplicationShellDefinition<Items[number]["screen"], Items[number]["icon"]> {
  if (!definition.id.trim() || !Number.isSafeInteger(definition.version) || definition.version < 1) {
    throw new Error("Invalid application shell identity");
  }
  if (!Array.isArray(definition.navigation) || definition.navigation.length === 0) {
    throw new Error("Application shell requires navigation items");
  }
  const screens = new Set<string>();
  for (const item of definition.navigation) {
    if (!item.screen.trim() || !item.label.trim() || !item.icon.trim()) {
      throw new Error("Invalid shell navigation item");
    }
    if (screens.has(item.screen)) throw new Error("Duplicate shell screen: " + item.screen);
    screens.add(item.screen);
  }
  if (!screens.has(definition.initialScreen)) {
    throw new Error("Initial shell screen is not registered: " + definition.initialScreen);
  }
  const navigation = Object.freeze(definition.navigation.map(item => Object.freeze({ ...item })));
  return Object.freeze({
    id: definition.id,
    version: definition.version,
    initialScreen: definition.initialScreen,
    navigation,
  }) as ApplicationShellDefinition<Items[number]["screen"], Items[number]["icon"]>;
}


export type FormFieldDefinition = Readonly<{
  id: string;
  label: string;
  kind: "text" | "number" | "date" | "select" | "checkbox";
  required?: boolean;
  options?: readonly Readonly<{ value: string; label: string }>[];
}>;

export type PresentationFormDefinition = Readonly<{
  id: string;
  version: number;
  fields: readonly FormFieldDefinition[];
}>;

export type FormSubmission = Readonly<{
  formId: string;
  formVersion: number;
  values: Readonly<Record<string, unknown>>;
}>;

/** Application-owned command boundary; presentation code never persists records itself. */
export type FormSubmissionPort<Result = unknown> = {
  submit(submission: FormSubmission): Promise<Result>;
};

/** Define a reusable form shape without embedding domain rules or persistence. */
export function definePresentationForm(
  definition: PresentationFormDefinition,
): PresentationFormDefinition {
  if (!definition.id.trim() || !Number.isSafeInteger(definition.version) || definition.version < 1) {
    throw new Error("Invalid presentation form identity");
  }
  if (!Array.isArray(definition.fields) || definition.fields.length === 0) {
    throw new Error("Presentation form requires fields");
  }
  const ids = new Set<string>();
  for (const field of definition.fields) {
    if (!field.id.trim() || !field.label.trim() || !["text", "number", "date", "select", "checkbox"].includes(field.kind)) {
      throw new Error("Invalid presentation form field");
    }
    if (ids.has(field.id)) throw new Error("Duplicate presentation form field: " + field.id);
    ids.add(field.id);
    if (field.kind === "select" && (!field.options || field.options.length === 0)) {
      throw new Error("Select form field requires options: " + field.id);
    }
  }
  return Object.freeze({
    id: definition.id,
    version: definition.version,
    fields: Object.freeze(definition.fields.map(field => Object.freeze({
      ...field,
      options: field.options ? Object.freeze(field.options.map(option => Object.freeze({ ...option }))) : undefined,
    }))),
  });
}
