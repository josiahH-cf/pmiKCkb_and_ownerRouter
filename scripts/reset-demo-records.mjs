import { resetDemoRecords } from "./demo-firestore.mjs";

const counts = await resetDemoRecords({
  note: "Reset before PMI KC KB demo show-and-tell.",
});

console.log(
  `Demo reset complete: total=${counts.total} created=${counts.created} updated=${counts.updated}`,
);
