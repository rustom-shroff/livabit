package org.liveabit.fixture;

import android.content.Intent;

public final class MainActivity extends BaseFixtureActivity {
    @Override protected int titleResource() { return R.string.first_screen; }
    @Override protected void switchScreen() {
        // An explicit, authored destination; no external Intent fields are inspected.
        startActivity(new Intent(this, SecondActivity.class));
    }
}
