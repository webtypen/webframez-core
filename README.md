# @webtypen/webframez-core

TypeScript-first backend framework core for Node.js.

This README reflects the current API in this repository and focuses on:
- Routing
- Datatables
- DataBuilder
- Console Commands
- Queue and Jobs

## Requirements

- Node.js `>= 20` (recommended)
- TypeScript for development

## Installation

```bash
npm i @webtypen/webframez-core
```

## AGENTS.md fuer Codex und Copilot

Das Paket enthaelt eine AGENTS.md mit empfohlenen Arbeitsregeln fuer AI-Coding-Agents in Webframez-Projekten.

Nach der Installation liegt die Datei im Paket unter:

```text
node_modules/@webtypen/webframez-core/AGENTS.md
```

Die Regeln beschreiben unter anderem:
- bevorzugte Nutzung von Model.objectId(...) statt eigener ObjectId-Resolver
- bevorzugte Nutzung der vorhandenen Helper wie StringFunctions, NumericFunctions und DateFunctions
- Verwendung der Webframez-Abstraktionen fuer Request, Response, Middleware, Storage, Datatables und Routes

Wichtig: AGENTS.md-Dateien haben keine universell standardisierte Import-Funktion. Die praktikable Variante ist deshalb, die Paket-AGENTS.md in der AGENTS.md des eigenen Projekts explizit zu referenzieren und projektspezifische Regeln lokal zu ergaenzen.

Beispiel fuer eine eigene AGENTS.md im Consumer-Projekt:

```md
# AGENTS.md

Dieses Projekt verwendet @webtypen/webframez-core.

Uebernimm fuer alle Webframez-bezogenen Implementierungen die Konventionen aus:
./node_modules/@webtypen/webframez-core/AGENTS.md

Insbesondere gilt:
- fuer ObjectId-Konvertierungen Model.objectId(...) oder die passende Model-Instanzmethode verwenden
- vorhandene Webframez-Helper und Facades bevorzugen statt neue Utilities oder Resolver anzulegen
- fuer HTTP-, Routing-, Middleware-, Storage- und Datatable-Code die Webframez-APIs und Konventionen beibehalten

Projektspezifische Ergaenzung:
- dieses Projekt verwendet fuer Admin-Routen zusaetzlich die Middleware "admin-auth"
- Antworten im Backoffice sollen das Format { status, message, data } einhalten
```

Wenn eine Regel aus der lokalen Projekt-AGENTS.md einer Regel aus der Paket-AGENTS.md widerspricht, sollte die lokale Projektregel Vorrang haben.

## Basic Web Setup

```ts
import { BaseKernelWeb, Request, Response, Route, WebApplication } from "@webtypen/webframez-core";

class Kernel extends BaseKernelWeb {
  static controller = {
    TestController: class {
      async index(req: Request, res: Response) {
        return res.send({ status: "ok" });
      }
    }
  };

  static middleware = {
    auth: async (next: Function, reject: Function, req: Request, res: Response) => {
      const isAllowed = true;
      if (!isAllowed) {
        return reject(new Error("Unauthorized"));
      }
      next(true);
    }
  };
}

const app = new WebApplication();
app.boot({
  kernel: Kernel,
  port: 3000,
  basename: null,
  routesFunction: () => {
    Route.get("/", "TestController@index");
  }
});
```

`WebApplication.boot(...)` supports:
- `kernel`
- `port`
- `basename`
- `routesFunction`
- `modules`
- `config`
- `datatables`
- `jobs`
- `mode`
- `onBoot`

## Routing

### Register Routes

```ts
Route.get("/", "HomeController@index");
Route.post("/login", "AuthController@login");
Route.put("/users/:id", "UserController@update");
Route.delete("/users/:id", "UserController@delete");
```

You can also register inline handlers:

```ts
Route.get("/health", (req: Request, res: Response) => {
  return res.send({ status: "ok" });
});
```

### Path Parameters and Wildcards

Supported path patterns:
- Required parameter: `/:id`
- Optional parameter: `/:id?`
- Single wildcard: `/*`
- Catch-all wildcard: `/**`

Matched values are available in `req.params`.

### Route Groups

```ts
Route.group({ prefix: "/admin", middleware: ["auth"] }, () => {
  Route.get("/dashboard", "AdminController@dashboard");

  Route.group({ prefix: "/users" }, () => {
    Route.get("/:id", "AdminUserController@details");
  });
});
```

### Route Middleware

Attach middleware by key via route options:

```ts
Route.get("/me", "AccountController@me", { middleware: ["auth"] });
```

### Route Domain Filter

You can restrict routes (or groups) to specific domains:

```ts
Route.group({ domains: ["websites.simplebis.com", "*.local.dev"] }, () => {
  Route.get("/", "HomeController@index");
});

Route.get("/api/health", "HealthController@index", {
  domains: ["api.example.com"]
});
```

Domain matching also works behind reverse proxies (`x-forwarded-host` is respected).
If a wildcard domain matches, the extracted wildcard value is available in
`req.routeDomainWildcard`. The matched request hostname is available in
`req.routeDomainMatch`.

Middleware signature:

```ts
(next, reject, req, res) => {
  // allow:
  next(true);

  // abort with error:
  // reject(new Error("Forbidden"));
}
```

### Extend the Route Facade

You can add custom route registration helpers:

```ts
Route.extend("jsonGet", (route) => {
  return (path: string, component: any, options?: any) => {
    route.get(path, async (req: Request, res: Response) => {
      res.header("Content-Type", "application/json");
      return component(req, res);
    }, options);
  };
});

(Route as any).jsonGet("/x", (req: Request, res: Response) => res.send({ ok: true }));
```

## Request and Response

### Request

`Request` includes:
- `method`, `url`, `headers`, `rawHeaders`
- `body`, `bodyPlain`
- `query`, `queryRaw`
- `params`
- `routeDomainMatch`, `routeDomainWildcard`
- `files`
- `message` (native `IncomingMessage`)

### Response

Common helpers:

```ts
res.status(201);
res.header("X-Test", "1");
res.send({ status: "success" });
```

Also available:
- `sendCsv(...)`
- `download(filepath, options?)`
- `stream(req, filepath, filename, mimeType)`
- `registerEvent("after", fn)`

## Datatables

Use `Datatable` + `DatatableRegistry` + `DatatableController`.

### Define a Datatable

```ts
import { Datatable, Request } from "@webtypen/webframez-core";

export class UsersTable extends Datatable {
  collection = "users";
  perPage = 25;

  columns = {
    name: { label: "Name" },
    email: { label: "E-Mail" }
  };

  filter = {
    name: { type: "text", mapping: "name" }
  };

  aggregation = async (req: Request) => {
    return [{ $sort: { created_at: -1 } }];
  };
}
```

### Register Datatables

```ts
app.boot({
  // ...
  datatables: {
    users: UsersTable
  }
});
```

### Datatable Endpoints

Use `DatatableController` in your routes:

```ts
import { DatatableController, Route } from "@webtypen/webframez-core";

Route.post("/api/datatable", "DatatableController@restApi");
Route.post("/api/datatable/export", "DatatableController@tableExport");
```

`restApi` supports:
- init requests (`init_request`)
- paginated data
- selectable functions (`apiFunction`)

`tableExport` uses your table `exports` definition.

## DataBuilder

Use `DataBuilder` + `DataBuilderController` for schema-driven CRUD flows.

### Define and Register Types

```ts
import { DataBuilder } from "@webtypen/webframez-core";

const builder = new DataBuilder();

builder.registerType({
  key: "user",
  singular: "User",
  plural: "Users",
  schema: {
    version: "1.0.0",
    collection: "users",
    fields: {
      email: { type: "text", required: true, unique: { match: {} } },
      age: { type: "integer" }
    }
  }
});
```

You can also use:
- `registerModelType(...)`
- `registerFieldType(...)`

### Expose the REST API

```ts
import { DataBuilderController, Route } from "@webtypen/webframez-core";

class MyDataBuilderController extends DataBuilderController {
  constructor() {
    super(builder);
  }
}

// Register controller in kernel, then:
Route.post("/api/builder", "MyDataBuilderController@restApi");
```

`__builder_rest_api` actions:
- `type`
- `details`
- `details-newdata`
- `save`
- `delete`
- `api-autocomplete`

## Console Commands

Use `ConsoleApplication` with `BaseKernelConsole`.

```ts
import { BaseKernelConsole, ConsoleApplication, ConsoleCommand } from "@webtypen/webframez-core";

class HelloCommand extends ConsoleCommand {
  static signature = "hello";
  static description = "Print a greeting";

  async handle() {
    this.success("Hello world");
  }
}

class KernelConsole extends BaseKernelConsole {
  static commands = [HelloCommand];
}

const app = new ConsoleApplication();
app.boot({
  kernel: KernelConsole,
  config: {}
});
```

`ConsoleCommand` helpers include:
- `getArguments()`, `getOptions()`, `getOption(...)`
- `ask(...)`
- `write`, `writeln`, `info`, `warning`, `success`, `error`
- progress helpers (`progress`, `progressIncrement`, `progressFinish`)

## Queue and Jobs

Queue workers run through console commands and use `queue_jobs` storage.

### Create a Job

```ts
import { BaseQueueJob } from "@webtypen/webframez-core";

export class SendMailJob extends BaseQueueJob {
  async handle(job: any) {
    this.log("Sending mail", job.payload);
    // do work...

    // optional delayed re-run:
    // return this.executeAgain(5, "minutes");
  }
}
```

Create a new queue entry:

```ts
await SendMailJob.create({
  payload: { userId: "..." },
  priority: 5,
  worker: null
});
```

### Register Jobs

```ts
app.boot({
  // ConsoleApplication or WebApplication
  jobs: [SendMailJob]
});
```

### Queue Config

Configure workers in `config.queue`:

```ts
export default {
  workers: {
    default: {
      is_active: true,
      jobclasses: ["SendMailJob"],
      automation: [
        {
          jobclass: "SendMailJob",
          executions: [
            ["every_x_mins", 15],
            ["daily", "08:00"],
            ["every_hour", 5],
            ["mondays", "09:30"]
          ]
        }
      ]
    }
  }
};
```

### Built-in Queue Commands

- `queue:start`
- `queue:status`
- `queue:stop`
- `queue:log`
- `queue:worker`
- `queue:worker:autorestart`

Additional built-in command:
- `build`

## Modules

You can load module providers via `modules` in `WebApplication.boot(...)`.

A module provider can:
- register controllers/middleware
- define `boot()`
- define `routes()`

## Lambda Mode

`LambdaApplication` uses the same router in AWS Lambda mode:

```ts
import { LambdaApplication } from "@webtypen/webframez-core";

const app = new LambdaApplication();
export const handler = (event: any, context: any) => {
  return app.boot(event, context, {
    kernel: Kernel,
    routesFunction: () => {
      Route.get("/status", (req, res) => res.send({ ok: true }));
    }
  });
};
```
