package org.liveabit.fixture;

public final class SecondActivity extends BaseFixtureActivity {
    @Override protected int titleResource() { return R.string.second_screen; }
    @Override protected void switchScreen() {
        // Return to the first authored screen without accumulating another Activity stack.
        finish();
    }
}
