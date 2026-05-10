import path from "path";

export function normalizeBackupPath(value: string) {
    return value.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function resolveProjectPath(value: string, projectRoot: string = process.cwd()) {
    return path.isAbsolute(value) ? value : path.resolve(projectRoot, value);
}

export function formatBackupFilename(template: string, values: { key: string; id: string; date: Date }) {
    const date = values.date;
    const yyyy = date.getFullYear().toString();
    const mm = (date.getMonth() + 1).toString().padStart(2, "0");
    const dd = date.getDate().toString().padStart(2, "0");
    const hh = date.getHours().toString().padStart(2, "0");
    const min = date.getMinutes().toString().padStart(2, "0");
    const ss = date.getSeconds().toString().padStart(2, "0");

    return template
        .replace(/\{key\}/g, values.key)
        .replace(/\{id\}/g, values.id)
        .replace(/\{date\}/g, `${yyyy}-${mm}-${dd}`)
        .replace(/\{time\}/g, `${hh}-${min}-${ss}`)
        .replace(/\{datetime\}/g, `${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}`);
}

export function backupTimestampId(date: Date = new Date()) {
    return date.toISOString().replace(/[-:TZ.]/g, "");
}
