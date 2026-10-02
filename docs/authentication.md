# Session, browser and cross-instance authentication

The new opt-in APIs are `SessionAuth`, `WebAuth`, `SsoAuthority` and `SsoClient`,
exported from `@webtypen/webframez-core`. They do not silently change existing
`UserAuth(Model)` JWT/collection consumers or migrate existing tokens.

## What each layer owns

- `SessionAuth`: independent device sessions, SHA-256 token hashes, short-lived
  access tokens, rotating refresh tokens, absolute expiry and explicit revocation.
- `WebAuth`: host-only cookies, pre-login and session-bound CSRF, browser login,
  refresh and logout. Password verification stays in the application.
- `SsoAuthority`: the main website authorizes a registered instance/environment
  and issues a 60-second, single-use authorization code.
- `SsoClient`: the instance starts a browser-bound state/PKCE transaction, exchanges
  the code on the server and can introspect the central session.

The SSO bridge is for registered first-party, confidential web clients. It is **not
an OpenID Connect implementation or a general OAuth authorization server**. Use a
standards-compliant provider for third-party federation/discovery/ID tokens. Existing
OAuth integrations must retain their separate protocol implementation.

## Browser sessions

Configure an absolute, trusted origin. It is never inferred from Host or forwarded
headers. Production requires HTTPS. Each deployment/host uses its own cookies; no
Domain attribute is supported. For local development only, use an explicit loopback
origin with `allowInsecureLocalhost: true` (different, non-__Host cookie names).

```ts
import { SessionAuth, WebAuth, WebAuthError, Request, Response } from '@webtypen/webframez-core';

const sessions = new SessionAuth({
  issuer: 'https://simplebis.com/',
  audience: 'simplebis-website',
  accessTokenSeconds: 15 * 60,
  sessionSeconds: 30 * 86400,
  // Uses the configured DBConnection and its document-capable driver.
  isSessionAllowed: async session => {
    const user = await User.where('_id', '=', await User.objectId(session.subject)).first();
    return user?.is_active === true;
  },
});
const web = new WebAuth(sessions, { origin: 'https://simplebis.com' });

// GET /auth/csrf — call via a same-origin fetch, not a cross-origin script.
function csrf(req: Request, res: Response) {
  return res.send({ csrf: web.bootstrap(req, res) });
}
// POST /auth/login — rate-limit this endpoint before password verification.
async function login(req: Request, res: Response) {
  const session = await web.login(req, res, async () => {
    // Application-defined credential check. Never accept a browser-supplied subject.
    const user = await verifyPassword(req.body.email, req.body.password);
    return user ? String(user._id) : null;
  });
  return res.send({ status: 'success' }); // Never return the token pair to browser JS.
}
async function refresh(req: Request, res: Response) {
  await web.refresh(req, res); // POST + Origin/Fetch-Metadata + CSRF required
  return res.send({ status: 'success' });
}
async function logout(req: Request, res: Response) {
  await web.logout(req, res); // POST; revokes this session and clears cookies
  return res.send({ status: 'success' });
}
async function authenticatedRoute(req: Request, res: Response) {
  const session = await web.authenticate(req); // unsafe methods validate CSRF
  if (!session) return res.status(401).send({ error: 'unauthorized' });
  // Authorize the resource against session.subject and session.environment.
  return res.header('Cache-Control', 'no-store').send({ userId: session.subject });
}
// In controller error handling: map WebAuthError.status to a JSON response.
// Fail closed on unexpected database/policy errors (503/500), never fall back to auth success.
```

Before submitting login, fetch `/auth/csrf` with same-origin credentials and send
its value in `X-CSRF-Token` (or `_csrf` for HTML forms). After login, read the new
`__Host-wf_csrf` cookie: the bootstrap token has been rotated and bound to the new
session. Only this CSRF cookie is readable by JavaScript; access/refresh cookies are
HttpOnly. All cookies are Secure, Path=/ and SameSite=Lax in production.

GET/HEAD/OPTIONS must not mutate application state. Unsafe requests require an exact
configured Origin; when browsers omit it, Fetch Metadata must say `same-origin`.
`same-site` is insufficient (sibling subdomains are a different trust boundary).
Missing/ambiguous cookies, malformed tokens and invalid CSRF fail closed. Browser
APIs should not enable credentialed cross-origin CORS. For non-browser clients call
`SessionAuth.authenticate(bearerToken)` explicitly, without mixing bearer and cookie
fallbacks in `WebAuth`.

When access expires, the browser POSTs to the refresh endpoint and retries. Coordinate
refresh **across tabs** (e.g. Web Locks) as well as within each tab. Refresh is strict:
only one concurrent exchange succeeds; replay of any consumed refresh token revokes
the entire device session, including the winning token pair. Never automatically
retry a refresh with the old token after a network timeout: require reauthentication
if the outcome is unknown. Other devices are unaffected. Refresh does not extend the
absolute session lifetime; history is bounded to 4096 rotations per session.

`list(subject)`, `revoke(sessionId)` and `revokeAll(subject)` are trusted server APIs.
Before exposing device controls, authenticate the request and verify ownership using
`inspect(sessionId)`. `revokeAll` affects the configured issuer/audience/environment
scope. Use it on password changes/resets; it is not an authorization check by itself.
A policy that checks active account/membership on each request makes account disable
and membership removal effective even before cleanup. Do not cache success forever.

## Central website → instance manager

1. The instance's `/auth/start` calls `SsoClient.begin(res, environment)` and redirects
   the browser to the configured main website. Select/validate the environment from
   the instance's routing, not arbitrary redirect URLs supplied by users.
2. The website authenticates its own browser cookie. If login is needed, retain the
   complete authorization request in a server-side transaction and resume after login.
3. `SsoAuthority.authorize` verifies the registered callback, PKCE S256 and a mandatory
   application policy. The policy must check **both** the user's active membership
   and the mapping of the environment to the requesting instance.
4. The browser returns with only `code`, `state`, and `iss`. The instance validates
   the state against a one-time server record and a HttpOnly browser-binding cookie.
5. The instance exchanges the code server-to-server with its client secret and PKCE
   verifier. It validates issuer, audience, environment and expiry in the response.
6. After mapping the central subject to a local account, create a local browser session.
   Each host has its own session; the main website's access/refresh tokens never travel
   to another instance or appear in a URL.

Provision clients through trusted administration, never public dynamic registration:

```ts
import { createSsoClientCredentials, SsoAuthority, readSsoClientCredentials } from '@webtypen/webframez-core';
const credentials = createSsoClientCredentials();
// Store {id, secretHash, redirectUris: ['https://instance.example/auth/callback']}
// at the authority. Deliver credentials.secret once to the instance's secret store.

const authority = new SsoAuthority({
  issuer: 'https://simplebis.com/', sessions,
  getClient: id => loadRegisteredInstanceClient(id),
  authorize: async (session, client, environment) =>
    await instanceOwnsEnvironment(client.id, environment) &&
    await hasActiveMembership(session.subject, environment),
});

// GET /sso/authorize, after validating the central browser session:
const redirect = await authority.authorize(web.cookies.read(req, 'access'), {
  clientId: req.query.client_id, redirectUri: req.query.redirect_uri,
  environment: req.query.environment, state: req.query.state,
  codeChallenge: req.query.code_challenge, codeChallengeMethod: req.query.code_challenge_method,
});
// If valid: Cache-Control: no-store, Referrer-Policy: no-referrer, redirect(redirect).
// If invalid: show a local error; NEVER redirect to an unvalidated supplied URL.

// POST /sso/token — JSON, HTTPS, server-to-server; never cookie authentication.
const credentials = readSsoClientCredentials(req);
const identity = credentials && await authority.exchange({
  ...credentials, code: req.body.code, codeVerifier: req.body.code_verifier,
  redirectUri: req.body.redirect_uri, environment: req.body.environment,
});
res.header('Cache-Control', 'no-store').send(identity || null);

// POST /sso/introspect — same client authentication, JSON response.
const credentials = readSsoClientCredentials(req);
const identity = credentials && await authority.introspect(
  credentials.clientId, credentials.clientSecret, req.body.session_id, req.body.environment,
);
res.header('Cache-Control', 'no-store').send(identity || null);
```

These are individual controller snippets. Validate request shapes, route methods and
body sizes at the HTTP boundary; convert malformed arguments into local 400 responses.
`SsoClient` expects HTTP 200 with the identity object or `null` at the backchannel
endpoints, not an application envelope. Basic credentials are read only from the
Authorization header. The network client has fixed configured HTTPS endpoints,
normal certificate validation, no redirect following, a 5-second deadline and a
16-KiB response limit. It does not fetch endpoints from browser inputs.

```ts
import { SsoClient, SessionAuth, WebAuth } from '@webtypen/webframez-core';
const sso = new SsoClient({
  issuer: 'https://simplebis.com/', origin: 'https://instance.example',
  clientId: INSTANCE_CLIENT_ID, clientSecret: INSTANCE_CLIENT_SECRET,
  authorizationEndpoint: 'https://simplebis.com/sso/authorize',
  tokenEndpoint: 'https://simplebis.com/sso/token',
  introspectionEndpoint: 'https://simplebis.com/sso/introspect',
  redirectUri: 'https://instance.example/auth/callback',
});

// Construct from trusted instance routing/configuration for this environment.
const localSessions = new SessionAuth({
  issuer: 'https://instance.example/', audience: INSTANCE_CLIENT_ID,
  environment: environmentId,
  isSessionAllowed: async session => {
    if (!session.parent || session.parent.issuer !== 'https://simplebis.com/') return false;
    const central = await sso.introspect(session.parent.sessionId, environmentId);
    return !!central && await localAccountMatchesCentralSubject(session.subject, central.subject);
  },
});
const instanceWeb = new WebAuth(localSessions, { origin: 'https://instance.example' });

// GET /auth/start
res.redirect(await sso.begin(res, environmentId));

// GET /auth/callback — deliberately uses state/PKCE/browser binding, not normal POST CSRF.
const identity = await sso.complete(req, res);
if (!identity) return res.status(401).send('SSO login failed');
// Resolve/configure localSessions for identity.environment; do not trust a different query tenant.
const localUser = await mapCentralAccount(identity.subject, identity.environment);
await instanceWeb.establishSession(String(localUser._id), res, {
  issuer: identity.issuer, sessionId: identity.authoritySessionId,
});
res.redirect('/manager'); // Configured local destination; remove code/state from browser URL.
```

The callback must have no third-party scripts/resources and must not log query strings.
State transactions expire after 5 minutes and are consumed once. Starting a second
SSO flow on the same host replaces the first browser binding; the earlier flow fails
closed rather than silently switching accounts.

Central logout takes effect on instances through the required session policy. The
example introspects every request and refresh; authority outages fail closed. If
performance requires caching, use a short explicitly chosen TTL and document the
resulting revocation delay; cache by issuer/client/session/environment, never just
by user. Immediate revocation and offline acceptance are incompatible. Removing an
instance registration, deactivating an account or removing membership must be reflected
by the authority callbacks. Local logout affects only the local device session;
central logout revokes the parent and therefore all derived sessions on their next
policy check. Provide a separate explicit central sign-out action when desired.

The sample uses one browser cookie namespace per host. Multiple environment tabs can
share a host but must not silently share an environment-bound session: use an explicit
per-environment cookiePrefix (still __Host-) or route all tabs through a host session
and authorize the environment on every resource request. Choose one policy deliberately.

## Storage, performance and rollout

The selected driver must implement `DocumentDatabase` and atomic `findOneAndUpdate`.
There is no read-modify-save fallback. A MongoDB primary/consistent document store
should serve auth reads; stale replica reads can delay revocation. New collections:
`auth_sessions`, `auth_sso_codes`, `auth_sso_transactions` (names/connection configurable).
Only token/code hashes are persisted. The client-side SSO transaction contains the
PKCE verifier server-side; restrict DB access as for other session material.

Every access/refresh/code lookup includes the primary `_id`, avoiding token scans.
For session management add an index on `(issuer, audience, environment, subject)`.
For cleanup add `(issuer, audience, environment, expiresAt)` to sessions and matching
issuer/client/expiry indexes to SSO tables. Timestamps are epoch milliseconds, not
MongoDB TTL Date fields: run each service's `cleanup()` periodically. Expired records
are rejected immediately even if the cleanup job has not run.

The application still owns credential hashing/verification, password policy, login
and reset rate limiting, MFA, activation/reset delivery, tenant membership and audit
logging without secrets. Use distributed rate limits for public credential and SSO
endpoints, body size limits, HTTPS/HSTS and XSS defenses. Auth cookies are not a defense
against scripts already running in the application's origin.

Existing `UserAuth.login()/logout()` only set in-memory state. Existing collection
mode and JWT mode retain their old semantics; they are not upgraded automatically.
New integrations should use these explicit session/web APIs. Migrate website and
instance consumers together, expire/revoke old credentials deliberately and do not
add a permissive legacy fallback to the new verifier. Existing simplebis website and
manager endpoints must be wired separately before this becomes their live login.

## Verification

Run `npm run build && npm test`. The auth tests cover expiry, device isolation,
refresh/code races and replay, cross-origin and session-bound CSRF failures, callback
browser binding, tenant/client/redirect/PKCE checks, central revocation, backchannel
response validation and policy/storage failures. The SSO integration test uses a
local HTTP server with the explicit loopback development option.

For an installed SQLite driver, also run:

```sh
WEBFRAMEZ_AUTH_SQLITE_DRIVER=/absolute/path/to/webframez-dbdriver-sqlite/lib node test-support/auth-sqlite-check.cjs
```

This verifies session and SSO races against the real document driver, without adding
a database driver dependency to the core. Exercise your deployed driver and proxy/TLS
configuration before rolling the new auth flow out to existing applications.

## References

- [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [OAuth Security BCP (RFC 9700)](https://www.rfc-editor.org/rfc/rfc9700.html)

## Standard browser login with `Route.auth`

```ts
import { Model, AuthScope, Route } from "@webtypen/webframez-core";

class User extends Model {
    __table = "users";
    __hidden = ["password"];
}

Route.auth("/api/auth", { model: User });
// GET /api/auth/csrf
// POST /api/auth/login, /api/auth/logout, /api/auth/refresh

// During registration: user.password = await AuthScope.hashPassword(password);
```

Set `auth.origin` or `website.baseUrl` to the canonical public URL (including the
correct development port); alternatively pass `origin` explicitly. HTTPS is
required outside localhost/loopback. Origins are never inferred from untrusted
Host or forwarding headers. Origin mismatches return `invalid_origin`; token
mismatches return `invalid_csrf`. Browser CSRF protection cannot be disabled:
`csrfDisabled` accepts only `false`. Non-browser bearer authentication uses a
separate adapter.

The default model fields are `_id`, `email`, `password` and `is_active`. Identifiers
are trimmed and lowercased before lookup; store them normalized. Passwords are
not trimmed. Store a bcrypt hash; existing bcrypt hashes work without migration.
`fields` configures field names, `verifyPassword` supports other existing hashes,
and `isUserAllowed` adds account/tenant checks on login and every session access.
An explicit `false` in `is_active` rejects the account; `fields.active: false`
disables this field check. Optional `session` options configure storage, scope
and lifetimes. For `AuthScope`, access lifetime defaults to 15 minutes and absolute session lifetime to
30 days; both remain configurable through `session.accessTokenSeconds` and
`session.sessionSeconds`. The lower-level `SessionAuth` retains its 15-minute
access-token default.

```ts
import { createAuthFetch, installAuthForms } from "@webtypen/webframez-core/auth-client";

window.fetch = createAuthFetch({ basePath: "/api/auth" });
installAuthForms({ basePath: "/api/auth" });
```

This public entry is browser-only and does not import server modules. It fetches
CSRF before login, sends `X-CSRF-Token` on same-origin mutations, and inserts
`_csrf` into native login forms. For a basename, supply the mounted `basePath`.
`loginPaths` supports aliases; `requiresCsrf` narrows mutation paths;
`cookieName` supports custom cookie prefixes. For a custom Fetch implementation,
pass it as the second argument to `createAuthFetch`.

`Route.auth` selects a shared registered scope with `auth: "main"` (the default).
Model and other scope options passed to `Route.auth` configure that scope in the
same `Auth` registry, including partial nested overrides.
`loginPath` keeps existing URLs, `loginResponse` adds application-specific response
fields (for example a validated redirect), and `onLogin` / `onAuthenticate` add application-specific callbacks. Browser
user-agent metadata and last activity are recorded automatically; `trackActivity: false`
disables tracking. Activity writes are throttled to once per minute. No user object or tokens are serialized by the default routes.
Route groups retain their middleware and domain restrictions. Login routes must
be accessible before authentication; apply authentication middleware to protected
application routes separately.


`audience` is a top-level option in both `Route.auth` and `AuthScope`. It takes
precedence over the still-supported `session.audience`; the default is the origin.
Standard error messages are included in English and German (`locale: "de"`);
`messages` overrides individual entries while retaining the remaining defaults.
Origin resolution also supports `application.website.baseUrl`, `WEBSITE_URL` and
`PUBLIC_BASE_URL`; explicit `origin` retains precedence.

```ts
Route.auth("/api/auth", {
    model: User,
    audience: "simplebis-website",
    locale: "de",
    auth: "main",
    // Optional overrides:
    messages: { invalid_login: "Bitte prüfe deine Zugangsdaten." },
});
```

Session metadata stays in the existing session collection. `sessions.list(subject)`
includes `userAgent` and `lastActiveAt` when available, so applications do not need
a second model/query or callbacks to maintain the session list. Existing records
without metadata remain valid; last activity falls back to the creation timestamp.


## Named auth scopes and lifecycle hooks

```ts
import { Auth, Config, Route } from "@webtypen/webframez-core";

Config.register("auth", {
    scopes: {
        main: { model: User, audience: "website", locale: "de" },
        admin: { model: AdminUser, audience: "administration" },
    },
});
Route.auth("/api/auth", {
    auth: "main",
    beforeLogin: async (req, user, scope) => {
        if (!await canLogIn(user, req)) throw new Error("Login denied by policy.");
    },
    afterLogin: async (req, user, scope) => { /* Login has completed. */ },
    beforeLogout: async (req, user, scope) => { /* Throw to prevent logout. */ },
    afterLogout: async (req, user, scope) => { /* Session revoked and cookies cleared. */ },
});

Auth.scope(); // same singleton scope as Auth.scope("main")
Auth.scope("admin");
Auth.registerScope("staff", { model: StaffUser });
```

Applications pass the auth configuration to the regular boot `config` object.
Web, console and Lambda boot initialize the registry after registering Config.
An automatic `main` scope exists unless `auth.main: false`; define its model in
`auth.scopes.main` or in `Route.auth({ model: User })` before using login. Configured
scopes and scopes registered at runtime remain available when automatic main is
disabled. Unknown keys fail explicitly. `auth.defaults` supplies shared options.
Registering an existing key updates its scope; routes resolve the current registry
entry on each request. `ModelAuth` remains a compatibility alias of `AuthScope`.

Each record in the default `auth_sessions` collection contains `scope`. Scope,
issuer, audience and environment are checked for all session operations. Named
scopes use separate cookie prefixes by default; configure the browser auth client
with the selected scope's CSRF cookie name when using a non-main scope.
The selected driver's ID adapter creates `_id` and converts `_subject`; MongoDB
stores both as BSON ObjectId. Stored records contain no extra `id` or `subject`.
Public session metadata still exposes string `id` and `subject` for transport.
Injected document stores must provide `session.idAdapter` as well as `database`.

The four hooks receive `(req, user, scope)` and await async callbacks. Login hooks
receive the verified user, never a browser-supplied subject. CSRF and origin checks
happen first. Exceptions in `beforeLogin` return `login_blocked`, and exceptions
in `beforeLogout` return `logout_blocked`; the response includes the exception's
message and a 403 status (or a thrown WebAuthError's status). No session/cookie
mutation or after-hook occurs on a rejected before-hook. After-hooks run after the
operation completes; their failures do not undo an already completed operation.
Existing `onLogin(session, req)` and `onAuthenticate(auth, req)` callbacks remain
supported. Individual `messages` entries can override before-hook error messages.

When migrating old MongoDB sessions, convert the former opaque `_id` to ObjectId
using the first 24 hex characters of SHA-256 of the former ID. Convert `subject`
to `_subject`, remove duplicate `id`/`subject`, and set the correct `scope`. Keep
hashes and expiry unchanged. SessionAuth recognizes the former token prefixes,
so converted sessions retain their existing cookies. Applications should run
an explicit migration while stopping auth writes, rather than changing schemas
implicitly during a request.


## Scope-configured lifetimes and password recovery

```ts
Config.register("auth", {
    scopes: {
        main: {
            model: User,
            session: {
                accessTokenSeconds: 15 * 60,
                sessionSeconds: 30 * 86400,
                idleTimeoutSeconds: 7 * 86400, // false explicitly disables inactivity expiry.
            },
            passwordReset: {
                tokenSeconds: 15 * 60,
                cooldownSeconds: 3 * 60,
                revokeSessions: "all", // "scope" or false are explicit alternatives.
            },
        },
    },
});

await Auth.scope().passwordReset?.request(email, async (user, token, expiresAt) => {
    // Build a link from your configured website URL, never from request Host headers.
    await sendResetEmail(user, token, expiresAt);
});
const user = await Auth.scope().passwordReset?.validate(token); // Does not consume it.
const changedUser = await Auth.scope().passwordReset?.reset(token, newPassword);
// null means invalid, expired, consumed, wrong scope, inactive account, or changed password.
```

Scope defaults are a 15-minute access lifetime, a 30-day absolute lifetime and a
seven-day inactivity limit. `session.idleTimeoutSeconds: false` disables only the
inactivity limit. All deadlines are enforced on access, refresh, CSRF, introspection
and listing. Existing records also respect newly shortened configured limits.
Successful authentication updates activity with throttled writes; introspection
and CSRF verification alone do not extend inactivity. Absolute expiry never slides.

`scope.resolve(req, res)` resumes an expired access token for GET/HEAD if the current
refresh secret and matching session-bound CSRF cookie are valid. It issues a new
access token and retains the refresh secret, so parallel page requests do not
trigger refresh replay revocation. This trusted read resumption does not authorize
unsafe requests, revive expired sessions, or extend absolute expiry. Explicit
POST refresh rotates both secrets and retains replay protection. Middleware uses
this resumption automatically when a response is available. Browser `createAuthFetch`
refreshes rejected authentication/CSRF requests once, then repeats the rejected
request once; login failures and permission errors are never retried. Web Locks
serialize refresh calls across tabs in browsers supporting that API; a per-window
single-flight promise remains the fallback.

Reset tokens have 256-bit random secrets; only a SHA-256 digest bound to the scope
and current password is stored. Per-account request cooldown is an atomic conditional
update. Successful reset consumes the token and writes the new password in the same
atomic database operation. Other password changes invalidate outstanding links.
The callback is a trusted server delivery integration; raw reset tokens must not be
returned to browsers by the request endpoint. Password validation remains the app's
responsibility. Disable recovery explicitly with `passwordReset: false`.

The fields `auth_reset_<scope>_hash`, `_expires_at` and `_requested_at` are stored
on the model's document collection and must be included in the model's `__hidden`
when serializing entire models. Auth snapshots always exclude these fields.
`revokeSessions: "all"` revokes registered scopes using the same model class;
`"scope"` limits revocation to the initiating scope. Recovery does not log in the
user automatically. Existing application plaintext reset links are intentionally
not accepted; users must request a new link after migration. Reset pages should
use `Referrer-Policy: no-referrer` and avoid response caching.
