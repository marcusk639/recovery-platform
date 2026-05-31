const admin = require("firebase-admin");
const serviceAccount = require("./recovery-connect.json");
const { program } = require("commander");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

program
  .name("countDocs")
  .description("Count the number of documents in a collection")
  .option("-c, --collection <collection>", "Collection to count")
  .parse(process.argv);

(async () => {
  const db = admin.firestore();
  const options = program.opts();
  const collectionRef = db.collection(options.collection);
  const result = await collectionRef.count().get();
  console.log(
    `Found ${result.data().count} documents in ${options.collection}`
  );
})();
