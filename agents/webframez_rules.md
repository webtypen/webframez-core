# AGENTS.md

Diese Datei definiert die Arbeitsregeln fuer Codex in Projekten, die @webtypen/webframez-core verwenden.

## Ziel

Codex soll in Webframez-Projekten bevorzugt bestehende Framework-Abstraktionen nutzen statt neue, redundante Hilfsstrukturen zu erzeugen. Wenn das Framework bereits eine Funktion, Facade, Basisklasse oder einen klaren Konventionspfad bereitstellt, ist dieser zu verwenden.

## Grundsatzregeln

1. Immer zuerst pruefen, ob @webtypen/webframez-core die benoetigte Funktion bereits exportiert.
2. Keine projektlokalen Wrapper, Resolver, Normalizer oder Utility-Dateien erzeugen, wenn das Framework die Aufgabe schon abdeckt.
3. Keine internen Framework-Pfade importieren. In Consumer-Projekten immer aus @webtypen/webframez-core importieren.
4. Bestehende Webframez-Konventionen haben Vorrang vor generischen Node.js-, Express- oder Eigenbau-Mustern.
5. Neue Abstraktionen nur dann erzeugen, wenn die Framework-API die Anforderung nachweislich nicht abbildet.
6. Controller-, Route-, Middleware-, Datatable- und Storage-Loesungen sollen idiomatisch fuer Webframez sein und nicht wie portierter Express-Code aussehen.

## Code-Formatierung und Leerzeilen

Diese Regeln gelten fuer neuen und bearbeiteten TypeScript-/JavaScript-Code im Core und in Webframez-Projekten. Verwende sinnvolle Leerzeilen, damit zusammengehoerige Bloecke erkennbar bleiben:

1. Nach dem letzten Import folgt genau eine Leerzeile vor der ersten Deklaration bzw. ihrem zugehoerigen Kommentar oder Decorator.
2. In Klassen folgt genau eine Leerzeile zwischen einem Block von Eigenschaften und dem ersten Konstruktor, Getter, Setter oder der ersten Methode.
3. Zwischen einzelnen Konstruktoren, Methoden, Gettern und Settern steht genau eine Leerzeile. Zusammengehoerige TypeScript-Overload-Signaturen bleiben mit ihrer Implementierung als Gruppe zusammen.
4. Zwischen eigenstaendigen Top-Level-Klassen, Funktionen, Interfaces und Typdefinitionen steht genau eine Leerzeile. Zugehoerige Kommentare und Decorators bleiben direkt an der Deklaration.
5. Zusammengehoerige Eigenschaften, etwa `key` und `type`, bleiben ohne zusaetzliche Leerzeilen zusammen. Innerhalb von Methoden trennen Leerzeilen fachlich unterschiedliche Schritte; nicht jede einzelne Anweisung wird abgesetzt.
6. Leerzeilen enthalten keine Leerzeichen oder Tabs. Keine mehrfachen Leerzeilen zur kuenstlichen Streckung verwenden. Vorhandene Einrueckungs- und Formatter-Vorgaben beibehalten.
7. Die Abstaende beim Schreiben bzw. Bearbeiten direkt einhalten und vor Abschluss pruefen. Ein Formatter ersetzt diese Regel nicht, wenn er die erforderlichen Leerzeilen nicht selbst einfuegt. Unbeteiligte Dateien nicht allein fuer eine flaechenweite Formatierung umschreiben.

Beispiel fuer den Abstand nach Imports:

```ts
import { FloatFieldType } from "./FloatFieldType";

export class CurrencyFieldType extends FloatFieldType {
    key = "currency";
    type = "currency";
}
```

Beispiel fuer Eigenschaften und Methoden:

```ts
import { DataBuilderFieldType, DataBuilderFieldContext, DataBuilderValidationContext } from "../DataBuilderFieldType";

export class ObjectFieldType extends DataBuilderFieldType {
    key = "object";
    type = "object";

    missingValue(context: DataBuilderFieldContext): any {
        return context.structured && context.field.schema ? this.convert({}, context) : null;
    }

    async validate(value: any, context: DataBuilderValidationContext) {
        const error = await super.validate(value, context);
        if (error) return error;
        return context.structured && !this.isMissing(value) && (typeof value !== "object" || Array.isArray(value))
            ? "Bitte ein Objekt angeben."
            : null;
    }

    async convert(value: any, context: DataBuilderFieldContext) {
        if (context.structured && context.field.schema) {
            return context.applyChildren(context.field.schema, { ...(context.currentValue || {}) }, context.path);
        }
        return value;
    }
}
```

## Imports

Bevorzuge immer dieses Muster:

```ts
import {
	BaseKernelWeb,
	Controller,
	Request,
	Response,
	Route,
	Model,
	Storage,
	Datatable,
	DatatableController,
	NumericFunctions,
	StringFunctions,
	DateFunctions,
} from "@webtypen/webframez-core";
```

Vermeide Importe aus internen Pfaden wie src/..., dist/... oder einzelnen Deep-Imports aus dem Paket, sofern nicht ausdruecklich anders vorgegeben.

## Models und Datenbank

1. Fuer ObjectId-Konvertierungen immer Model.objectId(...) oder die Instanzmethode objectId(...) verwenden, wenn man sich im Kontext eines Models befindet.
2. Keine redundanten resolveObjectId, parseObjectId, normalizeObjectId, toObjectId oder aehnlichen Hilfsmethoden erzeugen, wenn objectId(...) ausreicht.
3. Wenn kein konkretes Model passt, ist DBConnection.objectId(...) die zweite Wahl. Ein projektspezifischer Resolver ist nicht die erste Wahl.
4. Fachliche Datenzugriffe muessen ueber konkrete Model-Klassen erfolgen: pro persistierter Entitaet eine Klasse unter app/Models mit __table und gegebenenfalls __primaryKey / __connection. Models von Anfang an anlegen und in Controllern, Services, Screens und Formular-Hooks verwenden. Keine DatabaseService.collection(...)-Wrapper und keine eigenen Collection-/Cursor-/JSON-Persistenzschichten im Projekt.
5. Fuer Abfragen die Model-Methoden where(...), orderBy(...), first(), get(), paginate(), aggregate() verwenden. Fuer Einzelobjekte save(), update() und delete() verwenden. Vorbelegte IDs bei neuen Objekten beachten: Core Model.save() behandelt einen vorhandenen Primaerschluessel als Update; eine dokumentierte Insert-/create-Methode des Treibers nutzen, wenn die ID vor dem Insert feststeht.
6. Falls eine notwendige Faehigkeit fehlt (z.B. atomare bedingte Updates, Upserts, Projektionen oder Bulk-Inserts), diese generisch im Datenbanktreiber bzw. Framework ergaenzen. Keine Read-Modify-Save-Schleifen fuer Token-Rotation, Zaehler oder einmalige Codes; Filter und Aenderung muessen atomar ausgefuehrt werden.
7. Direkte DBConnection-/Treiberzugriffe sind auf Verbindungsverwaltung, Migrationen und Framework-Adapter begrenzt. Wenn ein bestehender Framework-Controller einen Datenbank-Handle verlangt, diesen nur an der Adaptergrenze weiterreichen. Geschaeftslogik bleibt bei Models.
8. Model-Mapping, Projekt-/Tenantfilter, versteckte Felder, Datentypen und bestehende Daten beim Wechsel des Treibers testen. Raw-Aggregationen liefern Datenobjekte; normale Model-Abfragen liefern Model-Instanzen.
9. Beziehungen ueber hasOne(...), hasMany(...) und hasManyArray(...) abbilden statt manuelle Lade- oder Resolve-Methoden pro Beziehung zu schreiben.
10. Model-Klassen sollen die Webframez-Konventionen fuer __table, __primaryKey und Mapping respektieren.

Bevorzugt:

```ts
const userId = await User.objectId(req.params.id);
const user = await User.where("_id", "=", userId).first();
```

Nicht bevorzugt:

```ts
const userId = resolveObjectId(req.params.id);
const user = await userRepository.findById(userId);
```

## Helper und Functions

1. Vor dem Schreiben eigener Utilities immer die vorhandenen Functions pruefen.
2. Fuer Zahlenformatierung NumericFunctions verwenden, z. B. numberFormat(...) oder bytesFormat(...).
3. Fuer Strings StringFunctions verwenden, z. B. slug(...), random(...), nl2br(...).
4. Fuer Datumslogik DateFunctions verwenden, z. B. formatDateRange(...).
5. Weitere vorhandene Helper wie FileFunctions oder PaginationFunctions ebenfalls bevorzugen, bevor neue Projekt-Utilities angelegt werden.
6. Keine neuen util.ts-, helpers.ts-, format.ts- oder string.ts-Dateien anlegen, wenn die Logik bereits in Webframez vorhanden ist.

Bevorzugt:

```ts
const slug = StringFunctions.slug(title);
const filesize = NumericFunctions.bytesFormat(file.size);
```

Nicht bevorzugt:

```ts
const slug = title.toLowerCase().replace(/\s+/g, "-");
const filesize = formatBytes(file.size);
```

## Request und Response

1. Controller- und Route-Handler sollen mit Request und Response aus Webframez arbeiten.
2. Uebliche Signatur ist async method(req: Request, res: Response).
3. Werte aus req.params, req.query, req.body, req.files, req.headers und req.routeDomainWildcard lesen statt parallele Request-Abstraktionen einzufuehren.
4. Antworten ueber res.status(...), res.header(...), res.send(...), res.sendCsv(...), res.download(...) oder res.stream(...) aufbauen.
5. Native Node-Objekte nur nutzen, wenn eine Low-Level-Anforderung besteht. Standardfaelle sollen ueber Request und Response abgewickelt werden.
6. JSON-Antworten nicht manuell serialisieren, wenn res.send(...) verwendet werden kann.

Bevorzugt:

```ts
export class UserController extends Controller {
	async details(req: Request, res: Response) {
		const user = await User.where("_id", "=", await User.objectId(req.params.id)).first();

		if (!user) {
			return res.status(404).send({ status: "error", message: "User not found" });
		}

		return res.send({ status: "success", data: user });
	}
}
```

Nicht bevorzugt:

```ts
async show(req: any, res: any) {
	res.setHeader("Content-Type", "application/json");
	res.end(JSON.stringify(data));
}
```

## Middleware

1. Middleware in der Kernel-Konfiguration registrieren, nicht als ad-hoc Inline-System rund um einzelne Controller neu erfinden.
2. Middleware-Signatur in Webframez ist next, reject, req, res.
3. Erfolgsfall ueber next(true) oder resolve-artiges Fortsetzen behandeln.
4. Ablehnung ueber reject(reason) abbilden, statt eigene Middleware-Fehlerprotokolle oder Express-next(error)-Nachbauten einzubauen.
5. Middleware per Route-Option middleware: ["auth"] oder ueber Route.group(...) anbinden.
6. Middleware soll Request und Response direkt weiterverwenden und keine zweite Context-Struktur einfuehren.

Bevorzugt:

```ts
static middleware = {
	auth: async (next: Function, reject: Function, req: Request, res: Response) => {
		if (!req.headers.authorization) {
			return reject("Unauthorized");
		}

		next(true);
	},
};
```

## Routes

1. Routen ueber die Route-Facade registrieren, nicht direkt ueber interne Router-Implementierungen.
2. Bevorzuge Route.get(...), Route.post(...), Route.put(...), Route.delete(...).
3. Controller-Routen im Format ControllerName@method registrieren, wenn keine zwingenden Gruende fuer Inline-Handler sprechen.
4. Gemeinsame Prefixe, Domains und Middleware ueber Route.group(...) kapseln statt zu duplizieren.
5. Route-Optionen wie middleware und domains verwenden, statt separate Routing-Metadaten-Systeme einzubauen.
6. Eigene Route-Helper nur ueber Route.extend(...) ergaenzen, nicht durch parallele Routing-Facades.

Bevorzugt:

```ts
Route.group({ prefix: "/admin", middleware: ["auth"] }, () => {
	Route.get("/users/:id", "AdminUserController@show");
});
```

Nicht bevorzugt:

```ts
Router.register("GET", "/admin/users/:id", handler, customMeta);
```

## Controller

1. Business-Logik fuer HTTP-Endpunkte gehoert in Controller-Methoden oder klar abgegrenzte Domain-Services, nicht in routes.ts.
2. Controller sollen von Controller erben, wenn im Projekt Webframez-Controller-Konventionen genutzt werden.
3. Controller sollen Request/Response und Model-/Helper-Abstraktionen direkt verwenden.
4. Keine Express-typischen Patterns wie req, res, next in Controller-Signaturen einfuehren, wenn kein echter Express-Adapter verwendet wird.

## Storage

1. Fuer Dateioperationen bevorzugt Storage oder Storage.disk(...) verwenden.
2. Keine direkten fs-Zugriffe fuer Standardfaelle erzeugen, wenn dieselbe Aufgabe ueber Storage moeglich ist.
3. Disk-Auswahl ueber Storage.disk("name") und nicht ueber hart codierte Basisverzeichnisse loesen.
4. Vorhandene Operationen wie put, copy, move, delete, mkdir, isDir, isFile, file, readDir und upload verwenden.
5. Datei-Metadaten bevorzugt ueber Storage.file(...).exists(), mime(), extension() usw. lesen.

Bevorzugt:

```ts
const filepath = await Storage.disk("public").put(buffer, "exports/report.csv");
const file = await Storage.disk("public").file(filepath);
const exists = await file.exists();
```

Nicht bevorzugt:

```ts
await fs.promises.writeFile(path.join(process.cwd(), "storage", "exports", "report.csv"), buffer);
```

## Datatables

1. Tabellen als Klassen auf Basis von Datatable implementieren.
2. Registrierung ueber DatatableRegistry.register(...) oder registerMany(...), nicht ueber projektspezifische Table-Resolver.
3. Standard-Endpunkte nach Moeglichkeit ueber DatatableController@restApi und DatatableController@tableExport anbinden.
4. Tabellenkonfiguration ueber collection, columns, filter, aggregation, subAggregation, exports, selectableFunctions und Hooks wie onInit, onData, onRow definieren.
5. Paginierung, Filterung und Exporte sollen die eingebauten Datatable-Mechanismen verwenden und nicht in jedem Projekt neu implementiert werden.
6. Selektierbare Sammelaktionen ueber selectableFunctions definieren, nicht ueber getrennte Ad-hoc-Endpunkte ohne Bezug zur Tabelle.

Bevorzugt:

```ts
Route.post("/api/datatable", "DatatableController@restApi");
Route.post("/api/datatable/export", "DatatableController@tableExport");
```

## Response- und Fehlerstil

1. Bestehende Response-Helfer verwenden und Antworten konsistent strukturieren.
2. Bei typischen API-Endpunkten bevorzugt status, message und data klar trennen.
3. Fehler nicht mit neuen, parallelen API-Response-Buildern abstrahieren, solange Response ausreicht.
4. Middleware-Fehler ueber reject(...), Controller-Fehler ueber klare Statuscodes und res.send(...).

## Was Codex vermeiden soll

1. Keine neuen Resolver wie resolveObjectId, resolveUserId, parseMongoId oder ensureObjectId erzeugen, wenn Model.objectId(...) reicht.
2. Keine neuen Utility-Sammlungen fuer String-, Zahl-, Datei- oder Datumslogik erzeugen, wenn Webframez bereits passende Functions exportiert.
3. Keine Express-, Fastify- oder Next.js-Muster in Webframez-Controller und -Routen uebertragen.
4. Keine direkten Router-, Storage- oder HTTP-Low-Level-Implementierungen bauen, wenn eine Framework-Facade existiert.
5. Keine duplizierten CRUD-, Datatable- oder Export-Grundgerueste bauen, wenn DatatableController oder andere Kernbausteine bereits passen.
6. Keine Deep-Imports oder interne Framework-Hacks in Consumer-Projekten verwenden.

## Entscheidungsregel bei Unsicherheit

Wenn Codex zwischen Eigenbau und Framework-Funktion waehlen muss, gilt standardmaessig:

1. Bestehende Webframez-API verwenden.
2. Vorhandene Konvention erweitern.
3. Erst zuletzt eine neue Abstraktion einfuehren.

Wenn eine neue Abstraktion doch noetig ist, muss im Code klar erkennbar sein, warum die vorhandene Webframez-Funktion nicht ausreicht.

## Suite navigation in generated projects

Use actual router Link components for navigation, with href and browser modifiers
preserved. Keep the Suite provider, renderer and AdminLayout mounted within a
project; never key them by pathname or hide them behind per-page context loading.
Key only changing page content, and reset the provider at project/account boundaries.
Configure Native Design's `suite.navigation.linkComponent` at the application
boundary. Keep server schemas serializable and authorization checks on every API.
Verify persistent layout state during navigation, not just HTTP status codes.
