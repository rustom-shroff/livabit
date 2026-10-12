package org.liveabit.publish;

import android.app.job.JobParameters;
import android.app.job.JobService;

public final class DeliveryJobService extends JobService {
    @Override public boolean onStartJob(JobParameters parameters) {
        PublisherApplication app = (PublisherApplication) getApplication();
        app.worker.execute(() -> {
            boolean automatic = parameters.getJobId() == DeliveryEngine.PERIODIC_JOB || parameters.getJobId() == DeliveryEngine.NEXT_DELIVERY_JOB;
            String stream = parameters.getExtras().getString("stream_id", "");
            long revision = parameters.getExtras().getLong("revision", -1);
            try {
                if (automatic) app.engine().automaticCycle(stream, revision);
                else app.engine().checkHealth();
            } catch (Exception ignored) { }
            finally {
                jobFinished(parameters, false);
                if (automatic) try { app.engine().automaticFinished(parameters.getJobId(), stream, revision); } catch (Exception ignored) { }
            }
        });
        return true;
    }
    @Override public boolean onStopJob(JobParameters parameters) {
        return parameters.getStopReason() != JobParameters.STOP_REASON_CANCELLED_BY_APP;
    }
}
