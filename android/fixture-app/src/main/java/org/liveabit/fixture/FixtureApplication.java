package org.liveabit.fixture;

import android.app.Application;
import android.os.SystemClock;
import org.liveabit.fixture.core.LifecycleFixtureCore;

/** New process, new empty ledger; no restore path or persistent fixture state. */
public final class FixtureApplication extends Application {
    private final LifecycleFixtureCore ledger = new LifecycleFixtureCore();

    public LifecycleFixtureCore ledger() { return ledger; }

    public static LifecycleFixtureCore.Sample sample() {
        return new LifecycleFixtureCore.Sample(System.currentTimeMillis(), SystemClock.elapsedRealtime());
    }
}
