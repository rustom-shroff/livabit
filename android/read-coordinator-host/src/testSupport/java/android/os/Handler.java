package android.os;

import java.util.concurrent.ConcurrentLinkedQueue;

/** Host seam: controlled delivery, no scheduled Android event loop. */
public final class Handler {
    public static volatile boolean rejectPosts;
    public static volatile boolean throwPosts;
    private static final ConcurrentLinkedQueue<Runnable> QUEUE = new ConcurrentLinkedQueue<>();
    public Handler(Looper looper) { }
    public boolean post(Runnable runnable) {
        if (throwPosts) throw new IllegalStateException("synthetic rejected main loop");
        if (rejectPosts) return false;
        QUEUE.add(runnable); return true;
    }
    public boolean postDelayed(Runnable runnable, long delay) { return true; }
    public void removeCallbacks(Runnable runnable) { QUEUE.removeIf(value -> value == runnable); }
    public static boolean hasPending() { return !QUEUE.isEmpty(); }
    public static void pump() { for (Runnable runnable; (runnable = QUEUE.poll()) != null;) runnable.run(); }
    public static void reset() { QUEUE.clear(); rejectPosts = false; throwPosts = false; }
}
