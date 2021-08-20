const { admin } = require("../utils/admin.js");
// Middleware
exports.auth = (req, res, next) => {
  let idToken;
  const authorization = req.headers.authorization;
  if (authorization && authorization.startsWith("Bearer "))
    idToken = authorization.split("Bearer ")[1];
  else return res.status(403).json({ error: "Unauthorized" });

  admin
    .auth()
    .verifyIdToken(idToken)
    .then((decodedToken) => {
      req.user = decodedToken;
      return db
        .collection("users")
        .where("userId", "==", req.user.uid)
        .limit(1)
        .get();
    })
    .then((data) => {
      req.user.handle = data.docs[0].data().handle;
      return next();
    })
    .catch((err) => {
      console.log("Error", err);
      return res.status(403).json(err);
    });
};
