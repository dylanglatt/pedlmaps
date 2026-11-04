# Privacy policy update + App Store privacy answers (Nov 2026)

The live policy at pedlmaps.com/privacy.html is mostly right. These are the changes needed
to match what the app actually does after the launch fixes. The website source isn't in this
repo, so apply them there.

## Changes to the policy text

**Feedback** (replace the current Feedback bullet):

> **Feedback.** If you send feedback from the app, we receive your message, your category
> choice (Bug, Idea, Other), and your name and email if you choose to enter them. We also
> attach basic technical details so we can reproduce issues: the app version and build, the
> screen you were on, and your device platform and OS version. Feedback is delivered to a
> private Discord channel that only the developer can read. Your name and email are remembered
> on your device so you don't have to retype them.

**Diagnostics** (replace the current Diagnostics bullet):

> **Diagnostics.** If the app crashes or hits an error, a crash report is sent to Sentry. It
> includes the error, the app version, and device model and OS. Network requests are not
> recorded, and any web address that appears in a report is stripped of its parameters, so
> reports do not include your location, searched addresses, or any keys. Crash reports are not
> linked to your identity.

**Location** (add one sentence to the existing Location bullet):

> To calculate routes and search for places, your current location and the addresses you
> search are sent to Google Maps Platform. Pedl does not store them.

**Third-party services** (update the list):

- Remove "Apple TestFlight" (or keep it only as "during beta testing").
- Add **Discord** (feedback delivery).
- Add **Google Cloud Text-to-Speech** (spoken directions: the text of each direction, which
  includes street names and the names of your stations and destination, is sent to Google to
  generate audio. No coordinates or account data are sent.)
- Keep Google Maps Platform, OpenRouteService, the GBFS feed, and Sentry.

**Data retention** (add):

> Feedback messages are kept until the issue is resolved, then deleted. Crash reports are kept
> for up to 90 days. To have your feedback deleted, email hello@pedlmaps.com.

**Affiliation** (add near the top):

> Pedl Maps is an independent app. It is not affiliated with or endorsed by Lyft, Citi Bike,
> Citibank, or any bike share operator.

Update the "Last updated" date.

## App Store Connect: App Privacy answers

Tracking: **No** (no ads, no data broker sharing, no cross-app tracking).

| Data type | Collected? | Linked to user? | Used for tracking? | Purpose |
|---|---|---|---|---|
| Precise Location | Yes | No | No | App Functionality |
| Contact Info: Name | Yes (optional, feedback) | No | No | App Functionality (support) |
| Contact Info: Email Address | Yes (optional, feedback) | No | No | App Functionality (support) |
| User Content: Customer Support | Yes (feedback message) | No | No | App Functionality |
| Search History | Yes (place searches sent to Google) | No | No | App Functionality |
| Diagnostics: Crash Data | Yes (Sentry) | No | No | App Functionality |
| Diagnostics: Performance Data | No (tracing is off) | | | |

Notes:
- "Linked to user" is No because there are no accounts and nothing ties these to an identity.
  If you'd rather be conservative on Name/Email, mark them Linked; it doesn't change review.
- Apple counts data sent to a third party you use (Google, Sentry, Discord) as "collected" by
  you, which is why location and search history are Yes even though Pedl stores nothing.
