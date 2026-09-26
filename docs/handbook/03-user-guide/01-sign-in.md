# 3.1 · Signing in, accounts and roles

> The screenshots that used to head this page showed the sign-in before the Hi-Vis Monochrome redesign and have been removed until new ones are taken.

## Signing in

Open **http://127.0.0.1:3000/sign-in**. The heading names the site, from `app.name` in `config/app.yaml` (*this host* until the service has answered).

1. Type your **username**, then **Continue**.
2. Type your **password**, then **Sign in**. **Change** takes you back to the username.

The username is not checked on its own: the page asks nothing of the service between the two steps, so it never tells anyone at the screen which usernames exist. A wrong username or password shows one sentence for both, *That username and password do not match an active account on this host*, and the attempt is recorded as `security / login_failed`. Five failures on one account within five minutes lock that account for five minutes; the page then shows the service's own message with the wait.

Under the form:

- **Have an invitation code? Accept it** opens [/invite](#accepting-an-invitation).
- **No account? Request access** opens [/request-access](#requesting-access).
- **Every sign-in is recorded.** It is: every attempt, accepted or refused, is on the hash-chained audit log.

There is no sign-up and no *forgot password*. On a production host every account is an administrator's decision, and an air-gapped host has no mail to send a reset link by: ask your administrator for a reset code instead.

At the foot, a line reports the host's own measurement, read from `GET /api/status`: *No connection has left this machine's loopback · checked 11:49 PM*, or that the service did not answer.

### Demo accounts

On a demo host (`demo.enabled: true`) a folded **Demo accounts** list sits under the form: one compact row per seeded account, with its name, role and username. Click a row to sign in as it; the demo password is sent for you. The list comes from `GET /api/auth/directory`, which lists the seeded accounts only in demo mode, so a production host shows no list at all.

> [!WARNING]
> Every seeded account uses the password `workbench` (`security.seed_user_password`). Seed accounts are created only in demo mode. On a production install set `demo.enabled: false` before the first start, and the host starts with **no accounts** (see below).

## The first start of a production host

With demo mode off and no administrator, the sign-in page sends you to **/setup**.

1. **Step 1, the setup token.** When the service started it wrote a one-time token to `storage/setup-token` on that machine and printed it in its console:

   ```text
   [workbench] no administrator on this host. One-time setup token (valid 24 h, also in …/storage/setup-token):
   [workbench]   3yq1…
   ```

   Paste it and **Continue**. It lapses 24 hours after it was issued; restarting the service issues a new one and retires the old.
2. **Step 2, your account.** Choose a username, a display name and a password (8 characters or more), then **Create administrator**. You are signed in and taken to **People**. The token and its file are deleted; `/setup` now says *This host is set up*.

The token is checked when the account is sent. A wrong or expired one brings you back to step 1 with the service's reason.

## Accepting an invitation

An administrator gives you a code such as `AEGIS-7KQX-M4TD-9HWP`, or a link `…/invite#code=…` that fills it in. On **/invite**, enter the code, a username, your name (optional if the administrator entered it) and a password, then **Accept invitation**. The role and department were fixed by whoever invited you; the page tells you what they are once you are in. Codes are single-use and expire (3 days unless the administrator chose otherwise). A used, expired, revoked or mistyped code gets the same message: ask for a new one.

## Requesting access

On **/request-access**, give a username, your name, the role you need, **why you need access** (the administrator reads exactly this) and a password, then **Send request**.

The page becomes **Waiting for approval**. It asks the service for a decision every 15 seconds and says when it last asked; you can close it and come back on the same browser. The account exists from the moment you ask but **cannot sign in** until an administrator approves it, and the role and department are theirs to choose, whatever you asked for.

- **Approved**: *You can sign in.* Use the username and password you chose.
- **Not approved**: the administrator's reason, and the account is removed. You may ask again.

## Resetting a password

Ask an administrator. They issue a one-time `RESET-…` code on the People screen; enter it with a new password on **/reset** (or open the link they give you). Setting it signs out every other session of your account.

## People (administrators)

Administrators (any role holding `users.manage`) reach **People** from the account menu at the foot of the sidebar. It holds:

| Section | What you can do |
|---|---|
| **Access requests** | Read each request and its reason. **Approve** with a role and department of your choosing, or **Reject…** with a reason the requester is shown. Recently decided requests fold away below |
| **Invitations** | Choose role, department, an optional name and an expiry, then **Create invitation**. The code and its link are shown **once**, with *Copy code* and *Copy link*; the service keeps only a hash of the code. Open invitations can be **revoked** |
| **Accounts** | Everyone who can sign in, where each account came from (`seed`, `owner`, `invite`, `request`) and who provisioned it. **Deactivate** ends the account's sessions at once and stops it signing in; **Activate** reverses it; **Reset password** issues a one-time code, shown once |
| **Directory** | What the build does with the AD/LDAP declaration in `config/app.yaml`: today, *not configured* |

You cannot deactivate yourself or the last active administrator. An account waiting on an access request is decided in the request queue, not switched on in the account list. Every one of these actions is written to the audit log with your name ([9.1](../09-security/01-access-control.md#how-accounts-come-to-exist)).

## Sessions

A successful sign-in creates a session that lasts **12 hours** (`security.session_ttl_minutes: 720`). The session is held two ways:

- a bearer token the console attaches to every API call;
- an `HttpOnly`, `SameSite=Strict` cookie named `workbench_session`, because the browser's live event stream (`EventSource`) cannot attach a header.

Passwords are stored only as salted PBKDF2-SHA256 hashes with 120,000 iterations (`security.password_hash_rounds: 12`, times 10,000).

## The roles

| Role | Demo account | Department | Clearance | Can | Cannot |
|---|---|---|---|---|---|
| **Operator** | `operator` | Operations | Confidential | Ask, upload, search knowledge, download own deliverables, read own audit records | See restricted data; add skills; approve |
| **Engineer** | `engineer` | Inspection | Restricted | Everything an operator can, plus ingest documents and add skills | Approve; read the whole audit log |
| **Reviewer** | `reviewer` | Engineering | Restricted | Everything an engineer can, plus approve and reject, read every run and the whole audit log | Approve their own runs |
| **Auditor** | `auditor` | Quality | Restricted | Read every run and the whole audit log, verify the chain | Create tasks; search knowledge |
| **Administrator** | `admin` | General | Restricted | Everything a reviewer can, plus manage models, knowledge, policy and **people**, delete anyone's skill | Approve their own runs |

The Head of Inspection and the Plant Manager are reviewers who give the two signatures a High finding needs ([3.5](05-approvals.md)). The full permission list is in [9.1 Access control](../09-security/01-access-control.md).

## Switching account

Click your name at the bottom of the sidebar. The account menu shows your display name, role, department and clearance, then **Switch demo account** with the seeded accounts, **People** if you are an administrator, and **Sign out**. Switching signs you in as the chosen demo account directly, which is handy for the reviewer and auditor steps of a demonstration; it works only where those accounts exist.

## Self-registration

The API still has `POST /api/auth/register`, for development only and off by default (`security.self_registration_enabled: false`). It is the one path that does not pass through an administrator, and no screen offers it.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 03 · Using the workbench](README.md) | [↑ 03 · Using the workbench](README.md) | [3.2 · Thread →](02-thread.md) |

<!-- nav:end -->
