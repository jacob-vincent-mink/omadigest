# X integration

Imports bounded public X posts through the official X API v2. It never scrapes X and does not claim or initiate OAuth.

## Setup and access

Create an X developer app, copy its app-only bearer token, and enter the username whose public mentions should be matched. Up to five additional public usernames can be selected for account activity. The probe performs one inexpensive `GET /2/users/by/username/:username` request. X access and usage charges depend on the developer account's current API plan.

An app-only bearer token can read eligible public data but cannot identify the token owner through `/2/users/me`, read private account data, direct messages, or perform user actions. The configured username is therefore required and is verified by public lookup.

## Context and bounds

One recent-search request returns at most 50 posts. Text is limited to 4,000 characters, normalized titles to 2,000, and responses to 512 KiB with a 10-second timeout. Categories are `mentions` and `account-activity`. Post text is untrusted evidence, never instructions. Only canonical credential-free `https://x.com/<user>/status/<id>` links are emitted.

The bearer token is a secret setup field held by OmaDigest's credential store. Errors never include the token, query response bodies, or source text.

Official references: [X API access and credential types](https://docs.x.com/x-api/getting-started/getting-access), [user lookup](https://docs.x.com/x-api/users/get-by-username), and [recent search](https://docs.x.com/x-api/posts/search-recent-posts).
