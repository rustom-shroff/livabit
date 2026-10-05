package org.liveabit.inspect;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONException;
import org.liveabit.collector.core.LocalInspectionCore;

import java.io.File;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Durable controls only. Projected usage events never enter this database. */
final class InspectionStore {
    static final class StoredControl {
        final long generation;
        final List<String> selectedPackages;

        StoredControl(long generation, List<String> selectedPackages) {
            this.generation = generation;
            this.selectedPackages = Collections.unmodifiableList(selectedPackages);
        }
    }

    private final File databaseFile;
    private SQLiteDatabase database;

    InspectionStore(Context context) {
        // Normal credential-encrypted app storage, explicitly excluded from backup/transfer.
        databaseFile = new File(context.getNoBackupFilesDir(), "inspection-controls.db");
    }

    synchronized StoredControl load() {
        open();
        try (Cursor cursor = database.query("controls", new String[]{"generation", "packages"},
                "id = ?", new String[]{"1"}, null, null, null)) {
            if (!cursor.moveToFirst()) return new StoredControl(0, new ArrayList<>());
            long generation = cursor.getLong(0);
            if (generation < 0 || generation == Long.MAX_VALUE) {
                throw new IllegalStateException("Invalid local control generation");
            }
            String encoded = cursor.getString(1);
            if (encoded == null || encoded.length() > 16384) {
                throw new IllegalStateException("Invalid local selection");
            }
            try {
                JSONArray array = new JSONArray(encoded);
                if (array.length() > 32) throw new IllegalStateException("Invalid local selection");
                List<String> packages = new ArrayList<>();
                for (int index = 0; index < array.length(); index++) {
                    String packageName = array.getString(index);
                    if (!packageName.matches("[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z][A-Za-z0-9_]*)+")
                            || packageName.length() > 128 || packages.contains(packageName)) {
                        throw new IllegalStateException("Invalid local selection");
                    }
                    packages.add(packageName);
                }
                return new StoredControl(generation, packages);
            } catch (JSONException error) {
                // Do not expose corrupt private bytes or exception text in diagnostics.
                throw new IllegalStateException("Invalid local selection");
            }
        }
    }

    synchronized void commit(LocalInspectionCore.Snapshot snapshot) {
        open();
        JSONArray packages = new JSONArray();
        for (String packageName : snapshot.selectedPackages) packages.put(packageName);
        ContentValues values = new ContentValues();
        values.put("id", 1);
        values.put("generation", snapshot.generation);
        values.put("active", snapshot.active ? 1 : 0);
        values.put("packages", packages.toString());
        database.beginTransaction();
        try {
            long written = database.insertWithOnConflict("controls", null, values,
                    SQLiteDatabase.CONFLICT_REPLACE);
            if (written != 1) throw new IllegalStateException("Local control commit failed");
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
    }

    synchronized void reset(LocalInspectionCore.Snapshot stoppedSnapshot) {
        close();
        if (databaseFile.exists() && !SQLiteDatabase.deleteDatabase(databaseFile)) {
            throw new IllegalStateException("Local deletion unavailable");
        }
        commit(stoppedSnapshot);
    }

    synchronized void close() {
        if (database != null) {
            database.close();
            database = null;
        }
    }

    private void open() {
        if (database != null && database.isOpen()) return;
        SQLiteDatabase.OpenParams parameters = new SQLiteDatabase.OpenParams.Builder()
                .addOpenFlags(SQLiteDatabase.CREATE_IF_NECESSARY)
                .setJournalMode(SQLiteDatabase.JOURNAL_MODE_DELETE)
                .setSynchronousMode(SQLiteDatabase.SYNC_MODE_FULL)
                .build();
        database = SQLiteDatabase.openDatabase(databaseFile, parameters);
        database.execPerConnectionSQL("PRAGMA secure_delete=ON", null);
        database.execSQL("CREATE TABLE IF NOT EXISTS controls ("
                + "id INTEGER PRIMARY KEY CHECK(id = 1), "
                + "generation INTEGER NOT NULL CHECK(generation >= 0), "
                + "active INTEGER NOT NULL CHECK(active IN (0,1)), "
                + "packages TEXT NOT NULL)");
    }
}
