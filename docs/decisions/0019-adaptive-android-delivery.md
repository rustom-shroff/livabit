# ADR-0019: Activity-aware Android sends and separate app pages

Date: **2026-10-12**. Status: **user-authorized implementation**.

The user requested configurable sending intervals, no automatic events after the screen has been off for fifteen minutes, five-minute sends while activity is arriving, and a cleaner interface.

Use persisted native one-off JobScheduler jobs. Default active send interval is **5 minutes** and the screen-off cutoff is **15 minutes**, both editable from 1 through 1440 minutes in Settings. Periodic jobs have a platform minimum of fifteen minutes, so they cannot implement the requested five-minute target. One-off minimum latency is a scheduling target; Android may delay it under system/battery constraints. No exact alarm, foreground service, hosted component or new runtime permission is introduced.

Check actual screen interactivity before automatic collection and before each queued send. Use local monotonic screen-off timing within a boot, recovering screen transitions from Android's usage source if the process missed its broadcast. After the cutoff, keep unexpired pending bodies but perform no automatic network requests. Recheck locally at the configured screen-off interval, and resume the active schedule when screen-on is observed or the app reopens. Screen state/timing is private scheduling state and is not added to OAP.

Skip automatic observations whose selected apps have no transitions or positive duration estimate. Advance the scan cursor without inventing a sequence/event. Retained pending requests still retry while the phone is active. Manual **Send now** remains available for an explicit observation; **Stop sharing** cancels both automatic job slots and clears pending activity. Outage warnings remain tied to real unsuccessful acknowledgements, not quiet/empty observations.

Alternate two one-off job IDs so completing a job does not replace itself while still running. Bind each job to its sharing stream and schedule revision; stale jobs cannot act on a replacement setup. Preference changes retain the stream, cursor, immutable queue and outage timer. Older settings gain the 5/15 defaults without rewriting already queued requests.

Use three native pages: **Activity** for sharing status, Start/Send/Stop and concise connection status; **Setup** for import/paste, Wi-Fi/USB guides, selected apps and usage access; **Settings** for active send interval, screen-off cutoff and receiver-warning interval. Manual address/key/agent fields sit behind an explicit editing control in Setup. Retain the secure-window flag and protected key storage.

Implement and verify directly on Android. Every proposed phone APK must pass the exact-byte emulator gate. Exercise real screen power, actual jobs and HTTP request counts, retained queue recovery, settings migration/save and rendered navigation. Duration precision, complete coverage, battery performance and exact scheduling timing retain their existing deferred/unproven scope.

Sources: [JobInfo minimum period](https://developer.android.com/reference/android/app/job/JobInfo#getMinPeriodMillis()), [one-off minimum latency](https://developer.android.com/reference/android/app/job/JobInfo.Builder#setMinimumLatency(long)), [screen interactivity](https://developer.android.com/reference/android/os/PowerManager#isInteractive()), [Android screen usage events](https://developer.android.com/reference/android/app/usage/UsageEvents.Event#SCREEN_NON_INTERACTIVE).
