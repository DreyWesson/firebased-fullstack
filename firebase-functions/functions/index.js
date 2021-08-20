const functions = require("firebase-functions");
const { getAllPosts, createPost } = require("./controllers/posts");
const { signup, login } = require("./controllers/users");
const { auth } = require("./middleware/auth");

const app = require("express")();
// const cors = require("cors");

// Post routes
app.get("/posts", getAllPosts);
app.post("/posts", auth, createPost);

// Signup route
app.post("/signup", signup);
app.post("/login", login);

exports.api = functions.https.onRequest(app);
