package org.liveabit.publish;

import android.app.Application;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class PublisherApplication extends Application {
    private DeliveryEngine engine;
    final ExecutorService worker = Executors.newSingleThreadExecutor();
    @Override public void onCreate() {
        super.onCreate();
        engine = new DeliveryEngine(this);
        engine.createChannel();
        try { engine.restoreScheduling(); } catch (Exception ignored) { /* The connection screen can retry restoration. */ }
    }
    DeliveryEngine engine() { return engine; }
}
