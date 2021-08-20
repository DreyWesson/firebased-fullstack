const { db } = require("../utils/admin.js");
const { config } = require("../config/index.js");
const firebase = require("firebase").initializeApp(config);

const { validateSignupData } = require("../utils/validators.js");

exports.signup = (req, res) => {
  const newUser = {
    email: req.body.email,
    password: req.body.password,
    confirmPassword: req.body.confirmPassword,
    handle: req.body.handle,
  };

  const { valid, errors } = validateSignupData(newUser);
  if (!valid) return res.status(400).json(errors);

  // make sure all userHandle fields are unique
  let token, userId;
  db.doc(`/users/${newUser.handle}`)
    .get()
    .then((doc) =>
      doc.exists
        ? res.status(400).json({ handle: "This handle is already taken" })
        : firebase
            .auth()
            .createUserWithEmailAndPassword(newUser.email, newUser.password)
    )
    .then((data) => {
      userId = data.user.uid;
      return data.user.getIdToken();
    })
    .then((idToken) => {
      token = idToken;
      const userCredentials = {
        handle: newUser.handle,
        email: newUser.email,
        createdAt: new Date().toISOString(),
        userId,
      };
      // persist userId in users collection firestore
      return db.doc(`/users/${newUser.handle}`).set(userCredentials);
    })
    .then(() => res.status(201).json({ token }))
    .catch((err) => {
      switch (err.code) {
        case "auth/email-already-in-use":
          return res.status(400).json({ email: "Email is already in use" });
        case "auth/weak-password":
          return res.status(400).json({ password: "Password is too weak" });

        default:
          return res.status(500).json({ error: err.code });
      }
    });
};

exports.login = (req, res) => {
  const user = {
    email: req.body.email,
    password: req.body.password,
  };
  const { valid, errors } = validateLoginData(user);
  if (!valid) return res.status(400).json(errors);

  firebase
    .auth()
    .signInWithEmailAndPassword(user.email, user.password)
    .then((data) => {
      return data.user.getIdToken();
    })
    .then((token) => {
      return res.json({ token });
    })
    .catch((err) => {
      switch (err.code) {
        case "auth/user-not-found":
          return res
            .status(403)
            .json({ general: "Wrong credentials, please try again" });
        default:
          return res.status(500).json({ error: err.code });
      }
    });
};
