# Google Calendar integration

Adds upcoming-event context using Google Calendar's private iCal feed. This avoids shipping an OAuth client secret or asking OmaDigest to control the account.

## Setup

1. Open Google Calendar in a browser.
2. Open **Settings** → the calendar → **Integrate calendar**.
3. Copy **Secret address in iCal format**.
4. Paste it into this integration's OmaDigest settings and choose **Connect calendar**.
5. Enable the integration after the probe succeeds.

The private address is a credential. OmaDigest stores it in the desktop Secret Service, supplies it only to this connector for a bounded sync, and does not send it to the digest model or ordinary settings.

## Context

The connector emits event ID, start/end time, title, a credential-free event URL when present, and provenance. It does not send descriptions, attendees, attachments, or the private feed address.

## Removal

Disable the integration first. Since this copy is bundled, its code disappears with OmaDigest. User-created integrations remain independently removable as one directory under `~/.config/omadigest/integrations/`.
