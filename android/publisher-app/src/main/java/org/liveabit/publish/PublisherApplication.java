package org.liveabit.publish;

import android.app.Application;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
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
        IntentFilter screens = new IntentFilter(Intent.ACTION_SCREEN_ON); screens.addAction(Intent.ACTION_SCREEN_OFF);
        registerReceiver(new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                worker.execute(() -> { try { engine.screenChanged(); } catch (Exception ignored) { } });
            }
        }, screens, Context.RECEIVER_NOT_EXPORTED);
    }
    DeliveryEngine engine() { return engine; }
}
