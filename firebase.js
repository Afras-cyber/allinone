const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://allinonedownload-4b420.firebaseio.com',
});

const db = admin.firestore();

const auth = admin.auth();

module.exports = { db, auth };