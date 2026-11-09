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
