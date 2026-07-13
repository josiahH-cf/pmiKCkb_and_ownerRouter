import { demoRecords, getVerifiedDemoFirestore } from "./demo-firestore.mjs";

const { db } = await getVerifiedDemoFirestore();
const now = new Date().toISOString();
const seedActor = "setup-seed";
const counts = { existing: 0, seeded: 0, total: demoRecords.length };

for (const record of demoRecords) {
  const ref = db.collection(record.collection).doc(record.id);
  const snapshot = await ref.get();

  if (snapshot.exists) {
    counts.existing += 1;
    continue;
  }

  await ref.set({
    id: record.id,
    ...record.data,
    created_at: now,
    ...(record.includeUpdatedAt === false ? {} : { updated_at: now }),
  });

  const entityType = entityTypeFor(record.collection);

  if (record.writeChangeLog !== false && entityType) {
    await db
      .collection("change_log")
      .doc(`seed-${record.id}`)
      .set({
        id: `seed-${record.id}`,
        action: "create",
        created_at: now,
        editor_uid: seedActor,
        entity_id: record.id,
        entity_type: entityType,
        note: "Created from safe four-workflow demo seed.",
      });
  }

  counts.seeded += 1;
}

console.log(
  `Demo seed complete: total=${counts.total} seeded=${counts.seeded} existing=${counts.existing}`,
);

function entityTypeFor(collection) {
  if (collection === "sops") {
    return "sop";
  }

  if (collection === "templates") {
    return "template";
  }

  if (collection === "placeholders") {
    return "placeholder";
  }

  if (collection === "tools") {
    return "tool";
  }

  return null;
}
