const { db } = require("../utils/admin.js");
const { config } = require("../config/index.js");
const firebase = require("firebase").initializeApp(config);
const { admin } = require("../utils/admin.js");
const { v4: uuidv4 } = require("uuid");

const {
  validateSignupData,
  validateLoginData,
  reduceUserDetails,
} = require("../utils/validators.js");

exports.signup = (req, res) => {
  const newUser = {
    email: req.body.email,
    password: req.body.password,
    confirmPassword: req.body.confirmPassword,
    handle: req.body.handle,
  };

  const { valid, errors } = validateSignupData(newUser);
  if (!valid) return res.status(400).json(errors);

  const noImg = "no-img.png";

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
        imageUrl: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${noImg}?alt=media`,
        userId,
      };
      // persist userId in users collection firestore
      return db.doc(`/users/${newUser.handle}`).set(userCredentials);
    })
    .then(() => res.status(201).json({ token }))
    .catch((err) => {
      const errObj = {
        "auth/email-already-in-use": "Email is already in use",
        "auth/weak-password": "Password is too weak",
      };
      return res.status(500).json({
        error: errObj[err.code] || "Something went wrong, please try again",
      });
      // switch (err.code) {
      //   case "auth/email-already-in-use":
      //     return res.status(400).json({ email: "Email is already in use" });
      //   case "auth/weak-password":
      //     return res.status(400).json({ password: "Password is too weak" });
      //   default:
      //     return res.status(500).json({ error: err.code || err.code});
      // }
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
      const errObj = {
        "auth/user-not-found": "Wrong credentials, please try again",
        "auth/wrong-password": "Wrong credentials, please try again",
      };
      return res.status(403).json({ general: errObj[err.code] || err.code });

      // switch (err.code) {
      //   case "auth/user-not-found":
      //     return res
      //       .status(403)
      //       .json({ general: "Wrong credentials, please try again" });
      //   default:
      //     return res.status(500).json({ error: err.code });
      // }
    });
};

exports.uploadDisplayPics = (req, res) => {
  const BusBoy = require("busboy"),
    path = require("path"),
    os = require("os"),
    fs = require("fs");

  const busboy = new BusBoy({ headers: req.headers });

  let imageFileName,
    imageToBeUploaded = {};

  busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
    if (mimetype !== "image/jpeg" && mimetype !== "image/png")
      return res.status(400).json({ error: "Wrong file type submitted" });

    const imageExtension = filename.split(".")[filename.split(".").length - 1];

    imageFileName = `IMG${uuidv4().slice(18)}.${imageExtension}`;

    const filepath = path.join(os.tmpdir(), imageFileName);

    imageToBeUploaded = { filepath, mimetype };
    file.pipe(fs.createWriteStream(filepath));
  });

  busboy.on("finish", () => {
    admin
      .storage()
      .bucket()
      .upload(imageToBeUploaded.filepath, {
        resumable: false,
        metadata: {
          metadata: {
            contentType: imageToBeUploaded.mimeType,
            firebaseStorageDownloadTokens: uuidv4(),
          },
        },
      })
      .then(() => {
        const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${imageFileName}?alt=media`;
        return db.doc(`/users/${req.user.handle}`).update({ imageUrl });
      })
      .then(() => {
        return res.json({ message: "Image uploaded successfully" });
      })
      .catch((err) => {
        console.error(err);
        return res.status(500).json({ error: err.code });
      });
  });

  busboy.end(req.rawBody);
};

exports.addUserDetails = (req, res) => {
  let userDetails = reduceUserDetails(req.body);

  db.doc(`/users/${req.user.handle}`)
    .update(userDetails)
    .then(() => res.json({ message: "Details added successfully" }))
    .catch((err) => res.status(500).json({ error: err }));
};

exports.getUserCredentials = (req, res) => {
  let userData = {};
  db.doc(`/users/${req.user.handle}`)
    .get()
    .then((doc) => {
      if (doc.exists) {
        userData.credentials = doc.data();
        return db
          .collection("likes")
          .where("userHandle", "==", req.user.handle)
          .get();
      }
    })
    .then((data) => {
      userData.likes = [];
      data.forEach((doc) => {
        userData.likes.push(doc.data());
      });
      return db
        .collection("notifications")
        .where("recipient", "==", req.user.handle)
        .orderBy("createdAt", "desc")
        .limit(10)
        .get();
    })
    .then((data) => {
      userData.notifications = [];
      data.forEach((doc) => {
        const { recipient, sender, createdAt, postId, type, read } = doc.data();
        userData.notifications.push({
          recipient,
          sender,
          createdAt,
          postId,
          type,
          read,
          notificationId: doc.id,
        });
      });
      return res.json(userData);
    })
    .catch((err) => {
      return res.status(500).json({ error: err });
    });
};

exports.getUserDetails = (req, res) => {
  let userData = {};
  db.doc(`/users/${req.params.handle}`)
    .get()
    .then((doc) => {
      if (doc.exists) {
        userData.user = doc.data();
        return db
          .collection("posts")
          .where("userHandle", "==", req.params.handle)
          .orderBy("createdAt", "desc")
          .get();
      } else {
        return res.status(404).json({ error: "User not found" });
      }
    })
    .then((data) => {
      userData.posts = [];
      data.forEach((doc) => {
        const trueData = doc.data();
        userData.posts.push({
          body: trueData.body,
          createdAt: trueData.createdAt,
          userHandle: trueData.userHandle,
          userImage: trueData.userImage,
          likeCount: trueData.likeCount,
          commentCount: trueData.commentCount,
          postId: doc.id,
        });
      });
      return res.json(userData);
    })
    .catch((err) => {
      return res.status(500).json({ error: err });
    });
};
exports.handleNotificationsRead = (req, res) => {
  let batch = db.batch();
  req.body.forEach((notificationId) => {
    const notification = db.doc(`/notifications/${notificationId}`);
    batch.update(notification, { read: true });
  });
  batch
    .commit()
    .then(() => res.json({ message: "Notifications marked as read" }))
    .catch((err) => res.status(500).json({ error: err }));
};
