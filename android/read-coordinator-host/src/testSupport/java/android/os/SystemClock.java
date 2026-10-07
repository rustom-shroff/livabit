package android.os;

import java.util.concurrent.TimeUnit;

public final class SystemClock {
    private static final long ORIGIN = System.nanoTime();
    public static volatile long offset;
    public static long elapsedRealtime() { return 1000 + TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - ORIGIN) + offset; }
}
