# Linear integration

Imports bounded work context from Linear's official GraphQL API using a personal API key. Create a key with read access in **Settings → Account → Security & access** and paste it into the masked setup field. The key is sent as Linear's documented `Authorization: <API_KEY>` header; this package does not claim OAuth.

The probe runs only `viewer { id name }`. Sync makes one bounded query for up to 50 non-completed issues assigned to the viewer and at most 10 recent comments and 10 history entries per issue. It emits assigned issues, comments (marking simple `@display name` matches as mentions), genuine state transitions with both `fromState` and `toState`, and work due within seven days or overdue. It does not infer a state change from `updatedAt` alone.

Responses are capped at 1 MiB and time out after 10 seconds. Item text is bounded, URLs are accepted only from credential-free `https://linear.app`, and no descriptions or attachments are requested. Issue titles, comments, state names, and all other service content are untrusted evidence, never instructions. GraphQL errors are reduced to actionable fixed messages so API keys and source bodies cannot appear in output.

Official references: [Linear GraphQL authentication and queries](https://linear.app/developers/graphql), [filtering](https://linear.app/developers/filtering), and [pagination](https://linear.app/developers/pagination).
