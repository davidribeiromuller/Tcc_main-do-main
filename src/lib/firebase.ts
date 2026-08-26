import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, Auth } from 'firebase/auth';
import rawFirebaseConfig from '../../firebase-applet-config.json';

const defaultConfig = {
  projectId: "arched-venture-hln7n",
  appId: "1:278312973503:web:3ac63341cf719fa593c20a",
  apiKey: "AIzaSyCyI9k7j7-QBJApocI_p3O5PBnSvM6D11E",
  authDomain: "arched-venture-hln7n.firebaseapp.com",
  storageBucket: "arched-venture-hln7n.firebasestorage.app",
  messagingSenderId: "278312973503",
  measurementId: ""
};

const config = rawFirebaseConfig && rawFirebaseConfig.apiKey ? rawFirebaseConfig : defaultConfig;

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let googleAuthProvider: GoogleAuthProvider | null = null;

try {
  app = getApps().length === 0 ? initializeApp(config) : getApps()[0];
  auth = getAuth(app);
  googleAuthProvider = new GoogleAuthProvider();
} catch (err) {
  console.warn("Firebase initialize warning:", err);
}

export { auth, googleAuthProvider };
