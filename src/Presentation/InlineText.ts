/** JSON-safe inline content, structurally shared with Native Design/Webframez Core. */
export type InlineTextIcon = {
    type: "icon";
    name: string;
    /** Omit for decorative icons next to equivalent text. */
    accessibilityLabel?: string;
    size?: number;
};
export type InlineTextDefinition = string | Record<string, string> | readonly (string | Record<string, string> | InlineTextIcon)[];
