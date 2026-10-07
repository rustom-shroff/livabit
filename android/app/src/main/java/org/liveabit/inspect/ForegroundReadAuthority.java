package org.liveabit.inspect;

/** Plain epoch data: an OS worker may retain this object without retaining an Activity. */
final class ForegroundReadAuthority {
    private boolean foreground;
    private long epoch;
    synchronized void resume() { foreground = true; }
    synchronized void leave() { foreground = false; epoch++; }
    synchronized void invalidate() { epoch++; }
    synchronized long advance() { return ++epoch; }
    synchronized boolean isForeground() { return foreground; }
    synchronized boolean matches(long capturedEpoch) { return foreground && epoch == capturedEpoch; }
}
