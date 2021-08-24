const functions = require("firebase-functions");
const {
  getAllPosts,
  createPost,
  getPost,
  postComment,
  unlikePost,
  likePost,
  deletePost,
} = require("./controllers/posts");
const {
  signup,
  login,
  uploadDisplayPics,
  addUserDetails,
  getUserCredentials,
  getUserDetails,
  handleNotificationsRead,
} = require("./controllers/users");
const { auth } = require("./middleware/auth");
const { db } = require("./utils/admin.js");

const app = require("express")();
// const cors = require("cors");

// Post routes
app.get("/posts", getAllPosts);
app.get("/posts/:postId", getPost);
app.get("/posts/:postId/like", auth, likePost);
app.get("/posts/:postId/unlike", auth, unlikePost);
app.post("/post", auth, createPost);
app.post("/posts/:postId/comment", auth, postComment);
app.delete("/posts/:postId", auth, deletePost);

// Users route
app.get("/user", auth, getUserCredentials);
app.get("/user/:handle", getUserDetails);
app.get("/notifications", auth, handleNotificationsRead);
app.post("/signup", signup);
app.post("/login", login);
app.post("/user/image", auth, uploadDisplayPics);
app.post("/user", auth, addUserDetails);

exports.api = functions.https.onRequest(app);

exports.createNotificationOnLike = functions.firestore
  .document("likes/{id}")
  .onCreate((snapshot) => {
    return db
      .doc(`/posts/${snapshot.data().postId}`)
      .get()
      .then(
        (doc) =>
          doc.exists &&
          doc.data().userHandle !== snapshot.data().userHandle &&
          db.doc(`/notifications/${snapshot.id}`).set({
            createdAt: new Date().toISOString(),
            recipient: doc.data().userHandle,
            sender: snapshot.data().userHandle,
            type: "like",
            read: false,
            postId: doc.id,
          })
      )
      .catch((err) => console.log(err));
  });

exports.deleteNotificationOnUnlike = functions.firestore
  .document("likes/{id}")
  .onDelete((snapshot) =>
    db
      .doc(`/notifications/${snapshot.id}`)
      .delete()
      .catch((err) => console.log(err))
  );

exports.createNotificationOnComment = functions.firestore
  .document("comments/{id}")
  .onCreate((snapshot) =>
    db
      .doc(`/posts/${snapshot.data().postId}`)
      .get()
      .then(
        (doc) =>
          doc.exists &&
          doc.data().userHandle !== snapshot.data().userHandle &&
          db.doc(`/notifications/${snapshot.id}`).set({
            createdAt: new Date().toISOString(),
            recipient: doc.data().userHandle,
            sender: snapshot.data().userHandle,
            type: "comment",
            read: false,
            postId: doc.id,
          })
      )
      .catch((err) => console.log(err))
  );

exports.onUserImageChange = functions.firestore
  .document("/users/{id}")
  .onUpdate((change) => {
    console.log("BEFORE", change.before.data());
    console.log("AFTER", change.after.data());
    if (change.before.data().imageUrl !== change.after.data().imageUrl) {
      console.log("Image has changed");
      let batch = db.batch();
      return db
        .collection("posts")
        .where("userHandle", "==", change.before.data().handle)
        .get()
        .then((data) => {
          data.forEach((doc) => {
            const post = db.doc(`/posts/${doc.id}`);
            batch.update(post, {
              userImage: change.after.data().imageUrl,
            });
            return batch.commit();
          });
        });
    } else return true;
  });

exports.onPostDelete = functions.firestore
  .document("posts/{postId}")
  .onDelete((snapshot, context) => {
    const postId = context.params.postId,
      batch = db.batch();

    return db
      .collection("comments")
      .where("postId", "==", postId)
      .get()
      .then((data) => {
        data.forEach((doc) => {
          const comment = db.doc(`/comments/${doc.id}`);
          batch.delete(comment);
        });
        return db.collection("likes").where("postId", "==", postId).get();
      })
      .then((data) => {
        data.forEach((doc) => {
          const comment = db.doc(`/likes/${doc.id}`);
          console.log(comment);
          batch.delete(comment);
        });
        return db
          .collection("notifications")
          .where("postId", "==", postId)
          .get();
      })
      .then((data) => {
        data.forEach((doc) => {
          const comment = db.doc(`/notifications/${doc.id}`);
          batch.delete(comment);
        });
        return batch.commit();
      })
      .catch((err) => console.log(err));
  });
