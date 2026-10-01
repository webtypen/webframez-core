export function assertFieldName(name: string) {
    if (!name || name.split(/[.\[\]]/).some((part) => ["__proto__", "constructor", "prototype"].includes(part))) {
        throw new Error("Invalid DataBuilder field name: " + name);
    }
}
