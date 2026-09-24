# 3.1 · Signing in and roles

<div align="center">
<img src="../../assets/readme/screenshot-signin.webp#gh-light-mode-only" alt="The AEGIS sign-in page with demo accounts" width="820">
<img src="../../assets/readme/screenshot-signin-dark.webp#gh-dark-mode-only" alt="The AEGIS sign-in page with demo accounts" width="820">
</div>

## Signing in

Open **http://127.0.0.1:3000/sign-in**. There are two ways in:

1. **Type a username and password**, then **Continue**. Accounts are local to this host; there is no cloud identity provider.
2. **Click a demo account** under *or try a demo account*. Each card names the role and what it is for. The password is filled in for you.

At the foot of the page, a line reports the host's own measurement: *No connection has left this machine's loopback · checked 11:49 PM*.

A wrong username or password shows *That username and password do not match an account on this host.* The attempt is recorded in the audit log as `security / login_failed`.

## Sessions

A successful sign-in creates a session that lasts **12 hours** (`security.session_ttl_minutes: 720`). The session is held two ways:

- a bearer token the console attaches to every API call;
- an `HttpOnly`, `SameSite=Strict` cookie named `workbench_session`, because the browser's live event stream (`EventSource`) cannot attach a header.

Passwords are stored only as salted PBKDF2-SHA256 hashes with 120,000 iterations (`security.password_hash_rounds: 12`, times 10,000).

> [!WARNING]
> Every seeded account uses the password `workbench`, set by `security.seed_user_password` in `config/app.yaml`. Change it, or override it with `SOVEREIGN_SECURITY__SEED_USER_PASSWORD`, **before the first start** on any host that is not a personal demo machine. Seed accounts are created only when the user table is empty.

## The five roles

| Role | Account | Department | Clearance | Can | Cannot |
|---|---|---|---|---|---|
| **Operator** | `operator` | Operations | Confidential | Ask, upload, search knowledge, download own deliverables, read own audit records | See restricted data; add skills; approve |
| **Engineer** | `engineer` | Inspection | Restricted | Everything an operator can, plus ingest documents and add skills | Approve; read the whole audit log |
| **Reviewer** | `reviewer` | Engineering | Restricted | Everything an engineer can, plus approve and reject, read every run and the whole audit log | Approve their own runs |
| **Auditor** | `auditor` | Quality | Restricted | Read every run and the whole audit log, verify the chain | Create tasks; search knowledge |
| **Administrator** | `admin` | General | Restricted | Everything a reviewer can, plus manage models, knowledge and policy, delete anyone's skill | Approve their own runs |

The full permission list is in [9.1 Access control](../09-security/01-access-control.md).

## Switching account

Click your name at the bottom of the sidebar. The account menu shows your display name, role, department and clearance, then **Switch demo account** with the other seeded accounts, and **Sign out**. Switching signs you in as the chosen account directly, which is handy for the reviewer and auditor steps of a demonstration.

## Self-registration

The API accepts `POST /api/auth/register`, which creates an account in the least-privileged role, **operator**, in the `operations` department (`security.self_registration_*` in `config/app.yaml`). The sign-in page does not offer a sign-up form. Higher roles are assigned only through local policy.

> [!CAUTION]
> With self-registration on and the console listening on every interface, anyone who can reach port 3000 can create an operator account. Set `security.self_registration_enabled: false` for any deployment beyond a single demo machine.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 03 · Using the workbench](README.md) | [↑ 03 · Using the workbench](README.md) | [3.2 · Thread →](02-thread.md) |

<!-- nav:end -->
