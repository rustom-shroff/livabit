# Security policy

This project is experimental. Development APKs and reference implementations
are not a supported production release. Security fixes are developed against
the current source; no older release has a promised maintenance period or
response deadline.

## Reporting a vulnerability

Use the repository's **Security → Report a vulnerability** option if private
vulnerability reporting is enabled. Check the repository's Security tab for
the available reporting channel. Do not assume private reporting is enabled.

If no private channel is available, open an issue asking the maintainer to
arrange one, without including exploit instructions or sensitive details.
Do not publicly post credentials, signing keys, private app activity, personal
goals, device identifiers or unredacted diagnostic files.

In a private report, include the affected version or commit, Android/API or
reference environment, expected and observed behavior, impact, and minimal
reproduction steps using synthetic activity and test credentials. Coordinate
public disclosure with the maintainer when possible.

## Project boundaries

Activity must travel directly from the user's device to the chosen agent's
existing infrastructure. Permission checks, local filtering, credential
protection, retention and offline revocation are security-sensitive behavior.
The project operates no activity relay and requests no production credentials
through public issues or chat.

Software is provided under the warranty disclaimer and liability limitation
in [LICENSE](LICENSE). This policy does not promise a security guarantee,
support service or release schedule.
