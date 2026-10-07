package org.liveabit.inspect;

import android.app.Application;
import org.liveabit.collector.core.LocalInspectionCore;
import java.util.Set;

/** Host persistence seam counts commits; it does not exercise SQLite. */
final class InspectionStore {
    static int commits;
    static final class StoredControl {
        final long generation = 0;
        final Set<String> selectedPackages = Set.of();
    }
    InspectionStore(Application application) { }
    StoredControl load() { return new StoredControl(); }
    void commit(LocalInspectionCore.Snapshot snapshot) { commits++; }
    void reset(LocalInspectionCore.Snapshot snapshot) { commits++; }
}
