package org.liveabit.publish;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/** Restores the saved sharing choice after unlock/reboot or an in-place app update. */
public final class StartupReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (intent == null || !(Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction()))) return;
        try {
            // Local scheduling only: no collection, HTTP or foreground service in this callback.
            // Restoration is idempotent and leaves stopped sharing stopped.
            ((PublisherApplication) context.getApplicationContext()).engine().restoreScheduling();
        } catch (Exception error) {
            Log.e("liveabit", "Saved sharing schedule could not be restored after startup");
        }
    }
}
