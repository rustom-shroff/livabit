# ADR-0020: Continued Android use across send windows

Date: **2026-10-12**. Status: **implementation under the user's continued-development instruction**.

Five-minute automatic sending must work when an app stays open without generating another resume/pause transition. The 0.7.0 per-query estimator created fresh state each window, so continued use could be mistaken for an empty scan and suppressed.

Implement a native Android package-level window estimator in the publisher. Keep the accepted local inspector and its evidence unchanged. Retain only a selected package's open transition depth and original opening time, plus a boundary wall/elapsed clock and boot identifier. Commit this small private context atomically with the cursor and immutable queue. A failed queue commit cannot advance it. Same-setup preference changes preserve it; Stop, usage-access loss, replacement setup and a failed collection invalidate it.

Carry context only across adjacent windows in the same boot with compatible wall/elapsed time. Bound open context to 24 hours and 32 selected packages. Discard it at a query gap, reboot, clock discontinuity or age limit. Duration belongs only to the new half-open window; transition counts include only records actually read in that window. Keep package-level overlap and ambiguous same-time records conservative. Null remains unknown. Neither uninterrupted inference nor closed estimates prove attention, coverage or precise duration.

Read screen-off timestamps separately using Android's screen-event filter, without projecting package/content fields. Clip inferred foreground time at those boundaries, including when the process missed a screen broadcast. An inactive screen produces no open tail. The existing configurable automatic pause still prevents network requests after its cutoff, and does not start an outage merely because activity is quiet.

Add **OAP 0.2.0-draft.2 activity.observation**. Its shape, byte limits, timestamps, unknown coverage and unverified quality stay the same; a positive duration no longer requires two transitions inside that window. Preserve draft 1's schema and semantics. The final desktop receiver accepts both revisions and retains strict validation of each; already queued draft-1 bodies are transmitted unchanged. Update the OpenClaw liveabit Skill to recognize both. No OAP 0.1.0 summary change, relay, model choice or goal import is introduced.

Verify production code directly in the installed Android APK: adjacent windows, closure, overlap, ambiguity, gaps/clocks/boot, age, scope, screen boundaries, persisted state and real uninterrupted fixture use with HTTP admission. Exercise actual final-receiver compatibility and retain exact APK evidence before a phone recommendation. Duration precision, complete physical coverage and battery/timing proof remain deferred.

Sources checked 2026-10-12: [Android resume/pause events](https://developer.android.com/reference/android/app/usage/UsageEvents.Event#ACTIVITY_RESUMED), [filtered Android usage queries](https://developer.android.com/reference/android/app/usage/UsageStatsManager#queryEvents(android.app.usage.UsageEventsQuery)). Android reports each activity instance's lifecycle; package-level duration remains our inference.
