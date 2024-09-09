import jwt from "jsonwebtoken";

const authJwt = (req, res, next) => {
  const token = req.headers["authorization"];
  if (!token) {
    res.status(403).send({ message: "No token provided!" });
  } else {
    jwt.verify(token, process.env.JWT_SECERET, (err, decoded) => {
      if (err) {
        res.status(401).send({ message: "Unauthorized!" });
      } else {
        req.userId = decoded.userId;
        req.storeName = decoded.storeName;
        next();
      }
    });
  }
};

export default authJwt;
