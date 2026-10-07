package android.app;

/** Host seam only; no Android runtime lifecycle or process behavior is simulated. */
public class Application {
    public final AppOpsManager testOperations = new AppOpsManager();
    public void onCreate() { }
    public <T> T getSystemService(Class<T> type) { return type.cast(testOperations); }
    public String getPackageName() { return "org.liveabit.inspect"; }
}
