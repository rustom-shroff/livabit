package org.liveabit.publish;

import android.app.job.JobParameters;
import android.app.job.JobService;

public final class DeliveryJobService extends JobService {
    @Override public boolean onStartJob(JobParameters parameters) {
        PublisherApplication app = (PublisherApplication) getApplication();
        app.worker.execute(() -> {
            if (parameters.getJobId() == DeliveryEngine.PERIODIC_JOB) app.engine().cycle(true);
            else { try { app.engine().checkHealth(); } catch (Exception ignored) {} }
            jobFinished(parameters, false);
        });
        return true;
    }
    @Override public boolean onStopJob(JobParameters parameters) { return true; }
}
