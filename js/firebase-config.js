/**
 * Firebase project configuration.
 *
 * This file is safe to expose publicly — a Firebase web config is not a
 * secret (it's the same thing your app already sends to every browser).
 * Access control happens in Firestore Security Rules, not by hiding this.
 *
 * SETUP (one-time, ~10 minutes):
 *   1. Go to https://console.firebase.google.com and create a project
 *      (the free "Spark" plan is enough for this).
 *   2. In the project, click the "</>" (Web) icon to register a web app.
 *   3. Firebase will show you a config object exactly like the one below.
 *      Copy your real values into this file, replacing the placeholders.
 *   4. In the Firebase console, enable:
 *        - Authentication -> Sign-in method -> Email/Password
 *        - Firestore Database -> Create database (production mode)
 *   5. In Authentication -> Users, add yourself as the one admin user
 *      (this is the only account that will ever be able to log into
 *      /admin and add or edit projects).
 *   6. In Firestore -> Rules, paste the contents of firestore.rules
 *      (in the project root) and publish. Make sure the rules also
 *      allow public reads / signed-in-only writes on the "skills"
 *      collection, the same way they do for "projects" and "settings".
 *
 * The Projects and Skills sections on the public site now read only
 * from Firestore — if either collection is empty or unreachable, that
 * section shows an empty-state message instead of any hardcoded data.
 */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBQ0sqRQR6FjWDiy2CfM09LJ88a8XgVGaQ",
  authDomain: "portfolio-915ac.firebaseapp.com",
  projectId: "portfolio-915ac",
  storageBucket: "portfolio-915ac.firebasestorage.app",
  messagingSenderId: "1018597868627",
  appId: "1:1018597868627:web:c8fc07b66fb4d4a4b7f2a6",
  measurementId: "G-W4863KK7X1"
};
