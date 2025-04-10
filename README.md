# webtypen webframez Docs

## Controller

### Register a controller

A new controller is registered via the `controller` attribute in `app/Kernel.ts`. Just add a new entry for the controller to the object. The key of the object is the unique name of the controller, this is used again when connecting routes.

The controllers are initialized once when the web service is started. When calling a route, a single controller instance is created per request and thrown away after the request finishes.

## Routing

### Register a route

Routes are managed via the app/routes.ts. Routes can be registered and configured with the Route Facade. Routes can be associated strictly with a request method (GET, POST, PUT, DELETE) or all request methods (ANY):

```ts
Route.get("/", "TestController@test");
Route.post("/test2", "TestController@test");
Route.put("/test2", "TestController@test");
Route.delete("/test2", "TestController@test");
Route.any("/test2", "TestController@test");
```

The URL path is specified in the first parameter. The second parameter connects the route to a controller method. A previously registered controller can be connected using the syntax `[CONTROLLER]@[METHODE]`.

Alternatively, a function can be specified directly or a previously imported one can be used:

```ts
// Directly
Route.get("/", (req: Request, res: Response) => res.send({ status: "success" }));

// Imported
import { myFunction } from "./myfunction";
Route.get("/", myFunction);
```

### Register a middleware

Middleware functions are also registered in `app/Kernel.ts.` A middleware function can be associated with one or more routes. When calling these routes, the middleware function is called before executing the route logic. In this function, the request can be continued or aborted, for example, authorization rules can be implemented and easily reused for multiple routes.

Middleware functions are usually created under `app/Middleware`. A middleware function is called with the parameters (next, abort, req and res):

-   `next`: Function that signals when called that the request may be continued
-   `abort`: Function that aborts the request when called. An HTTP status code can be specified in the first parameter and a request body (usually text or JSON) in the second.
-   `req`: The Request-Object
-   `res`: The Response-Object

Alternatively, middleware functions can also be defined directly in Kernel.ts:

```ts
static middleware: { [key: string]: any } = {
  auth: async (next: any, abort: any, req: Request, res: Response) => {
    console.log("auth-middleware");
    next();
  },
};
```

A route can be connected to several middleware functions, which are called one after the other but before executing the route logic.

### Connect a route with a middleware

When registering a route, a configuration object can be passed in the third parameter. This can contain an array with middleware keys in the `middleware` parameter. The middlewares specified here are executed prior to executing the route logic when invoking this route. If a specified middleware aborts the request, it will not be executed:

```ts
Route.get("/auth-data", "AuthController@authData", { middleware: ["auth"] });
```

### Group routes

With the grouping of routes, the code of the application can be significantly reduced and kept clear. Here's how the following configurations can be used with a multiple route definition:

-   `prefix`: A route path prefix used for all routes in this group:

```ts
Route.group({ prefix: "/admin", () => {
    Route.get("/dashboard", "AdminDashboardController@data");
    // Path for this route would be: /admin/dashboard
}});
```

-   `middleware`: An array of middleware-keys used for all routes in this group:

```ts
Route.group({ middleware: ["auth"], () => {
    // Route with middleware auth
    Route.get("/auth-data", "AuthController@authData");

    // Route with middleware auth and admin
    Route.get("/dashboard", "AdminDashboardController@data", { middleware: ["admin"] });
}});
```

The configuration parameters of a route group can of course be combined with each other.

Nesting of the route groups is also possible:

```ts
Route.group({ prefix: "/test" }, () => {
    Route.get("/", "TestController@test"); // Path: /test/
    Route.get("/test2", "TestController@test"); // Path: /test2/

    Route.group({ middleware: ["auth"], prefix: "/auth" }, () => {
        Route.get("/data", "AuthController@data"); // Path: /test/auth/data; Middleware: auth
    });
});
```

## Database

### Connect

The application can handle multiple database connections, but one is defined as the default connection and is automatically used by the system if models and database requests are not explicitly executed over another connection.

The connections are configured in the `config/database.ts` file. Each connection is given a unique key in the `connections` object and uses a driver. The following drivers are currently available:

-   MongoDB Driver

Depending on the driver, the database connection must be configured with different parameters.

**MongoDB Connection example:**

```ts
export default {
    defaultConnection: "default",
    connections: {
        ["default"]: {
            driver: "mongodb",
            url: "mongodb://...",
        },
    },
};
```

### Model

Models are usually placed under `app/Models`. Each model class inherits from `Model` and must store the table / collection name, in which the models data sets are stored, in the `__table` attribute.

```ts
import { Model, hasMany, QueryBuilder } from "@webtypen/webframez-core";
import { File } from "./File";
import { Session } from "./Session";
import { CustomerGroups } from "./CustomerGroups";

export class User extends Model {
    __table = "users";

    /**
     * @param File                 Dependency Model
     * @param foreignKey
     * @param localKey             (optional)
     * @param queryBuilderFunction (optional) customize the query
     **/
    @hasOne(() => File, "_user_avatar", "_id", (query: QueryBuilder) => {
        query.where("status", "=", "uploaded");
    })
    avatar!: () => File;

    /**
     * @param Session              Dependency Model
     * @param foreignKey
     * @param localKey             (optional)
     * @param queryBuilderFunction (optional) customize the query
     **/
    @hasMany(() => Session, "_user")
    sessions!: () => Session[];

    /**
     * @param CustomerGroups       Dependency Model
     * @param foreignKey
     * @param localKey             (optional)
     * @param queryBuilderFunction (optional) customize the query
     **/
    @hasManyArray(() => CustomerGroups, "_groups")
    groups!: () => CustomerGroups[];
}
```

### Load a model

```ts
import { User } from "../Models/User";

const users = await User.where("is_active", "=", true).get();
const testUser = await User.where("email", "=", "test@test.de").where("is_active", "=", true).first();
```

#### Dependency Injection

```ts
const sessions = await testUser.session();
const avatarUrl = await testUser.avatar()?.url;
const customerGroups = await testUser.groups();
```

##### Disable cache / force dependency-reload:

```ts
const refreshedData = await testUser.session({ force: true });
```

##### Get dependency-query:

```ts
const oldSessions = await testUser.session({ query: true }).where("date", "<", moment().subtract(30, "days").format("YYYY-MM-DD")).get();
```
