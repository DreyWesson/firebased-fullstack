const { admin, db } = require("../utils/admin.js");
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
      let trueData = data.docs[0].data();
      req.user.handle = trueData.handle;
      req.user.imageUrl = trueData.imageUrl;
      return next();
    })
    .catch((err) => {
      console.log("Error", err);
      return res.status(403).json(err);
    });
};
