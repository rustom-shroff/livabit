package android.app;

public final class AppOpsManager {
    public static final String OPSTR_GET_USAGE_STATS = "android:get_usage_stats";
    public interface OnOpChangedListener { void onOpChanged(String operation, String packageName); }
    private OnOpChangedListener listener;
    public void startWatchingMode(String operation, String packageName, OnOpChangedListener listener) { this.listener = listener; }
    public void signalChange() { listener.onOpChanged(OPSTR_GET_USAGE_STATS, "org.liveabit.inspect"); }
}
