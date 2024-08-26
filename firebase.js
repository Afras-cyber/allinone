const admin = require("firebase-admin");
// const serviceAccount = require('./serviceAccountKey.json');
require('dotenv').config();

admin.initializeApp({
  credential: admin.credential.cert({
    type: process.env?.type || "",
    project_id: process.env?.project_id || "",
    private_key_id: process.env?.private_key_id || "",
    private_key: process.env?.private_key?.replace(/\\n/g, '\n') || "",
    client_email: process.env?.client_email || "",
    client_id: process.env?.client_id || "",
    auth_uri: process.env?.auth_uri || "",
    token_uri: process.env?.token_uri || "",
    auth_provider_x509_cert_url: process.env?.auth_provider_x509_cert_url || "",
    client_x509_cert_url: process.env?.client_x509_cert_url || "",
    universe_domain: process.env?.universe_domain || "",
  }),
  databaseURL: "https://allinonedownload-4b420.firebaseio.com",
});

const db = admin.firestore();
const auth = admin.auth();

module.exports = { db, auth };
